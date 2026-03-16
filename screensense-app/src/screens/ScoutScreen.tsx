/**
 * Scout — ScreenSense AI Wellbeing Companion
 * ============================================
 * Context-aware conversational AI powered by Claude.
 * Knows your stress score, mood, care level, and history
 * before you say a word. Surfaces therapy tools and places
 * as inline action cards mid-conversation.
 *
 * Clinical boundaries:
 * - Never diagnoses
 * - Redirects to crisis resources at care level 3+
 * - Every session has a disclaimer
 * - Not a replacement for professional care
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Animated,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { C, Space, Radius, Font, Shadow } from '../utils/theme';
import { api } from '../services/api';

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

interface Message {
  id: string;
  role: 'user' | 'scout';
  text: string;
  timestamp: Date;
  actionCards?: ActionCard[];
  isTyping?: boolean;
}

interface ActionCard {
  type: 'tool' | 'place' | 'resource' | 'crisis';
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  action?: string;
}

interface ScoutProps {
  userId: string;
  userName: string;
  currentMood?: string;
  currentStress?: number;
  careLevel?: number;
  lastResult?: any;
  onNavigate?: (screen: string) => void;
}

// Build the system prompt from user context
function buildSystemPrompt(props: ScoutProps): string {
  const { userName, currentMood, currentStress, careLevel, lastResult } = props;
  const stressPct = currentStress ? Math.round(currentStress * 100) : null;
  const careLevelLabel = ['Stable', 'Monitor', 'Intervention', 'Crisis'][( careLevel || 1) - 1];

  return `You are Scout, a warm and clinically-grounded AI wellbeing companion built into the ScreenSense app. You support users with stress, anxiety, and low mood using evidence-based techniques from CBT, mindfulness, and behavioural activation.

CURRENT USER CONTEXT (from their latest check-in):
- Name: ${userName}
- Mood: ${currentMood || 'unknown'}
- ML stress score: ${stressPct !== null ? `${stressPct}/100` : 'not yet assessed'}
- Care level: ${careLevel || 1} — ${careLevelLabel}
- Neighbourhood: ${lastResult?.neighbourhood || 'London'}
- Weather: ${lastResult?.weather_condition || 'unknown'}
${lastResult?.risk_factors_detected?.length > 0 ? `- Risk factors detected: ${lastResult.risk_factors_detected.join(', ')}` : ''}
${lastResult?.protective_factors?.length > 0 ? `- Protective factors: ${lastResult.protective_factors.join(', ')}` : ''}

PERSONALITY:
- Warm, direct, non-judgmental
- Evidence-based — cite techniques (CBT, MBSR, etc.) naturally in conversation
- Acknowledge feelings before offering tools
- Short messages — max 3 sentences per turn unless explaining a technique
- Never use clinical jargon without explaining it

CLINICAL BOUNDARIES (non-negotiable):
- Never diagnose any condition
- Never claim to replace professional care
- At care level 3 or 4: always mention professional support within 2 turns
- If crisis language appears: immediately switch to grounding + crisis resources
- End every session with: "Remember, I'm a support tool — not a substitute for professional care"

TOOLS YOU CAN SUGGEST:
When relevant, suggest these ScreenSense tools by name so the app can surface them:
- [BREATHING] 4-7-8 breathing exercise
- [CBT] Thought challenger
- [GRATITUDE] Gratitude log
- [MINDFULNESS] Mindfulness timer
- [PLACE] Recommend nearby place (park, library, café)
- [CRISIS] Crisis support resources

Format tool suggestions like: "I'd suggest trying [BREATHING] right now — it only takes 2 minutes."

RESPONSE FORMAT:
- Plain conversational text
- When suggesting a tool, use the [TAG] format above
- Keep responses concise and human
- Don't start with "I" — vary your sentence openings`;
}

// Parse action cards from Scout's message
function parseActionCards(text: string, lastResult: any): ActionCard[] {
  const cards: ActionCard[] = [];

  const toolMap: Record<string, ActionCard> = {
    '[BREATHING]': { type: 'tool', icon: '🫁', title: '4-7-8 breathing', subtitle: '2 min · reduces anxiety now', color: C.teal, action: 'therapy' },
    '[CBT]':       { type: 'tool', icon: '🧠', title: 'Thought challenger', subtitle: 'CBT reframe · Beck (1979)', color: C.violet, action: 'therapy' },
    '[GRATITUDE]': { type: 'tool', icon: '🙏', title: 'Gratitude log', subtitle: 'Positive psychology · 3 min', color: C.stressLow, action: 'therapy' },
    '[MINDFULNESS]':{ type: 'tool', icon: '🧘', title: 'Mindfulness timer', subtitle: 'MBSR · Kabat-Zinn (1990)', color: C.warning, action: 'therapy' },
    '[CRISIS]':    { type: 'crisis', icon: '🆘', title: 'Crisis support', subtitle: 'Samaritans · NHS 111 · free', color: C.danger, action: 'crisis' },
  };

  for (const [tag, card] of Object.entries(toolMap)) {
    if (text.includes(tag)) cards.push(card);
  }

  if (text.includes('[PLACE]') && lastResult?.place_recommendations?.[0]) {
    const p = lastResult.place_recommendations[0];
    cards.push({ type: 'place', icon: p.icon || '📍', title: p.name, subtitle: `${p.type} · ${p.distance_m || '?'}m away`, color: C.info || C.teal, action: 'map' });
  }

  return cards;
}

// Clean tags from display text
function cleanText(text: string): string {
  return text.replace(/\[BREATHING\]|\[CBT\]|\[GRATITUDE\]|\[MINDFULNESS\]|\[PLACE\]|\[CRISIS\]/g, '').trim();
}

export default function ScoutScreen({ userId, userName, currentMood, currentStress, careLevel, lastResult, onNavigate }: ScoutProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    // Auto-start with context-aware greeting
    startSession();
  }, []);

  const startSession = useCallback(async () => {
    setSessionStarted(true);
    const stressPct = currentStress ? Math.round(currentStress * 100) : null;
    let greeting = `Hey ${userName.split(' ')[0]}. `;

    if (careLevel === 4) {
      greeting += "I can see from your check-in that things feel really difficult right now. I'm here with you. What's going on?";
    } else if (currentMood && stressPct && stressPct > 60) {
      greeting += `I can see from your check-in that today's been tough — stress at ${stressPct}/100 and feeling ${currentMood}. What's been the hardest part?`;
    } else if (currentMood) {
      greeting += `Your check-in shows you're feeling ${currentMood} today. How are things going?`;
    } else {
      greeting += "Good to see you. How are you feeling right now?";
    }

    const welcomeMsg: Message = {
      id: Date.now().toString(),
      role: 'scout',
      text: greeting,
      timestamp: new Date(),
      actionCards: careLevel && careLevel >= 3 ? [{
        type: 'crisis', icon: '🆘', title: 'Support resources',
        subtitle: 'Available 24/7 · free · confidential',
        color: C.danger, action: 'crisis'
      }] : undefined,
    };
    setMessages([welcomeMsg]);
  }, [userName, currentMood, currentStress, careLevel]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');
    setLoading(true);

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
      timestamp: new Date(),
    };

    // Add typing indicator
    const typingMsg: Message = {
      id: 'typing',
      role: 'scout',
      text: '',
      timestamp: new Date(),
      isTyping: true,
    };

    setMessages(prev => [...prev, userMsg, typingMsg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // Build conversation history for Claude
      const history = messages
        .filter(m => !m.isTyping && m.id !== 'typing')
        .map(m => ({
          role: m.role === 'scout' ? 'assistant' : 'user',
          content: m.text,
        }));

      history.push({ role: 'user', content: userText });

      // Call Claude API
      const response = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          system: buildSystemPrompt({ userId, userName, currentMood, currentStress, careLevel, lastResult }),
          messages: history,
        }),
      });

      const data = await response.json();
      const scoutText = data.content?.[0]?.text || "I'm here with you. Tell me more.";
      const actionCards = parseActionCards(scoutText, lastResult);
      const displayText = cleanText(scoutText);

      const scoutMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'scout',
        text: displayText,
        timestamp: new Date(),
        actionCards: actionCards.length > 0 ? actionCards : undefined,
      };

      setMessages(prev => prev.filter(m => m.id !== 'typing').concat(scoutMsg));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== 'typing').concat({
        id: (Date.now() + 1).toString(),
        role: 'scout',
        text: "I'm having trouble connecting right now. If you're in distress, please reach out to Samaritans on 116 123.",
        timestamp: new Date(),
      }));
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, userId, userName, currentMood, currentStress, careLevel, lastResult]);

  const stressColor = currentStress
    ? currentStress > 0.66 ? C.stressHigh : currentStress > 0.33 ? C.stressMid : C.stressLow
    : C.violet;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.avatar}>
              <Text style={{ fontSize: 18 }}>🧠</Text>
            </View>
            <View>
              <Text style={s.headerName}>Scout</Text>
              <View style={s.onlineRow}>
                <View style={s.onlineDot} />
                <Text style={s.headerSub}>Your wellbeing companion</Text>
              </View>
            </View>
          </View>
          {/* Context pills */}
          <View style={s.contextPills}>
            {currentStress !== undefined && (
              <View style={[s.pill, { backgroundColor: stressColor + '20' }]}>
                <Text style={[s.pillTxt, { color: stressColor }]}>stress {Math.round(currentStress * 100)}</Text>
              </View>
            )}
            {currentMood && (
              <View style={[s.pill, { backgroundColor: C.tealDim }]}>
                <Text style={[s.pillTxt, { color: C.teal }]}>{currentMood}</Text>
              </View>
            )}
            {careLevel && careLevel > 1 && (
              <View style={[s.pill, { backgroundColor: C.violetDim }]}>
                <Text style={[s.pillTxt, { color: C.violetSoft }]}>level {careLevel}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Disclaimer */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTxt}>Scout is a support tool — not a substitute for professional mental health care</Text>
        </View>

        {/* Messages */}
        <ScrollView ref={scrollRef} style={s.messages} contentContainerStyle={s.messagesContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} onAction={onNavigate} />
          ))}
          <View style={{ height: 12 }} />
        </ScrollView>

        {/* Quick prompts — show when no messages */}
        {messages.length <= 1 && (
          <View style={s.quickPrompts}>
            {[
              "I'm feeling really anxious",
              "Help me with a breathing exercise",
              "I can't stop overthinking",
              "I need to talk",
            ].map(p => (
              <TouchableOpacity key={p} style={s.quickBtn} onPress={() => { setInput(p); }}>
                <Text style={s.quickBtnTxt}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input */}
        <View style={s.inputArea}>
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder={`Reply to Scout…`}
            placeholderTextColor={C.textGhost}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendBtnTxt}>↑</Text>}
          </TouchableOpacity>
        </View>

      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message: msg, onAction }: { message: Message; onAction?: (screen: string) => void }) {
  const isScout = msg.role === 'scout';

  if (msg.isTyping) {
    return (
      <View style={[mb.row, mb.scoutRow]}>
        <View style={mb.scoutAvatar}><Text style={{ fontSize: 12 }}>🧠</Text></View>
        <View style={[mb.bubble, mb.scoutBubble]}>
          <View style={mb.typingDots}>
            {[0, 1, 2].map(i => <TypingDot key={i} delay={i * 200} />)}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[mb.row, isScout ? mb.scoutRow : mb.userRow]}>
      {isScout && <View style={mb.scoutAvatar}><Text style={{ fontSize: 12 }}>🧠</Text></View>}
      <View style={{ maxWidth: '78%' }}>
        <View style={[mb.bubble, isScout ? mb.scoutBubble : mb.userBubble]}>
          <Text style={[mb.text, isScout ? mb.scoutText : mb.userText]}>{msg.text}</Text>
          <Text style={mb.time}>{msg.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        {/* Action cards */}
        {msg.actionCards && msg.actionCards.length > 0 && (
          <View style={mb.cards}>
            {msg.actionCards.map((card, i) => (
              <TouchableOpacity key={i} style={[mb.card, { backgroundColor: card.color + '15' }]}
                onPress={() => card.action && onAction?.(card.action)} activeOpacity={0.8}>
                <Text style={{ fontSize: 18, flexShrink: 0 }}>{card.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[mb.cardTitle, { color: card.color }]}>{card.title}</Text>
                  <Text style={mb.cardSub}>{card.subtitle}</Text>
                </View>
                <Text style={[mb.cardArrow, { color: card.color }]}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Animated.View style={[mb.typingDot, { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]} />
  );
}

const mb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12, paddingHorizontal: Space['6'] },
  scoutRow: {},
  userRow: { justifyContent: 'flex-end' },
  scoutAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.violetDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  bubble: { borderRadius: 4, padding: 10 },
  scoutBubble: { backgroundColor: C.card, borderRadius: 4, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  userBubble: { backgroundColor: C.violet, borderRadius: 14, borderTopRightRadius: 4 },
  text: { fontSize: 14, lineHeight: 22 },
  scoutText: { color: C.text },
  userText: { color: '#fff' },
  time: { fontSize: 10, color: C.textGhost, marginTop: 4, textAlign: 'right' },
  cards: { marginTop: 6, gap: 5 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.md, padding: 10 },
  cardTitle: { fontSize: 13, fontWeight: '600', marginBottom: 1 },
  cardSub: { fontSize: 11, color: C.textDim },
  cardArrow: { fontSize: 14, fontWeight: '700' },
  typingDots: { flexDirection: 'row', gap: 4, padding: 4 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.textDim },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: Space['5'], paddingTop: Space['5'], paddingBottom: Space['4'], borderBottomWidth: 1, borderBottomColor: C.line },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Space['3'], marginBottom: Space['3'] },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.violetDim, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: 16, fontWeight: '700', color: C.text },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.stressLow },
  headerSub: { fontSize: 12, color: C.textDim },
  contextPills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  pillTxt: { fontSize: 11, fontWeight: '600' },
  disclaimer: { paddingHorizontal: Space['5'], paddingVertical: Space['2'], backgroundColor: C.elevated },
  disclaimerTxt: { fontSize: 10, color: C.textGhost, textAlign: 'center', lineHeight: 16 },
  messages: { flex: 1 },
  messagesContent: { paddingTop: Space['5'] },
  quickPrompts: { paddingHorizontal: Space['5'], paddingBottom: Space['3'], gap: 6 },
  quickBtn: { backgroundColor: C.card, borderRadius: Radius.full, paddingHorizontal: Space['4'], paddingVertical: Space['2'], alignSelf: 'flex-start' as any },
  quickBtnTxt: { fontSize: 13, color: C.textSub },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', gap: Space['2'], paddingHorizontal: Space['4'], paddingVertical: Space['3'], borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, backgroundColor: C.card, borderRadius: 22, paddingHorizontal: Space['4'], paddingVertical: Space['3'], color: C.text, fontSize: 15, maxHeight: 100, lineHeight: 22 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.violet, alignItems: 'center', justifyContent: 'center', ...Shadow.violet },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
});
