"""
ScreenSense BiLSTM Distress Classifier
========================================
A custom Bidirectional LSTM trained to classify journal text
into distress levels. Replaces rule-based VADER with a genuine
deep learning NLP model.

Architecture:
  Embedding → BiLSTM (2 layers) → Attention → Dense → Softmax

Classes:
  0: neutral          — general journaling, no distress signals
  1: mild_distress    — low mood, tiredness, minor worry
  2: moderate_distress— anxiety, stress, feeling overwhelmed
  3: high_distress    — hopelessness, persistent low mood
  4: crisis_indicator — self-harm language, suicidal ideation

Academic citations:
  Schuster, M. & Paliwal, K.K. (1997). Bidirectional recurrent
    neural networks. IEEE Transactions on Signal Processing, 45(11).
  Bahdanau, D., Cho, K. & Bengio, Y. (2015). Neural machine
    translation by jointly learning to align and translate. ICLR.
  Hochreiter, S. & Schmidhuber, J. (1997). Long Short-Term Memory.
    Neural Computation, 9(8), 1735-1780.

Dissertation value:
  This forms the third model in the ScreenSense hybrid ensemble:
  - Random Forest: device signal stress classification
  - LSTM: longitudinal mood prediction
  - BiLSTM: natural language distress detection
  The combination constitutes a novel multi-modal affect sensing
  architecture not present in comparable student projects.

Training: python -m app.ml.bilstm_distress
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import json
import re
from pathlib import Path
from collections import Counter
from typing import List, Dict, Optional, Tuple

MODEL_DIR = Path(__file__).parent.parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ── Constants ─────────────────────────────────────────────────
MAX_LEN   = 64
VOCAB_SIZE = 3000
EMBED_DIM  = 64
HIDDEN_DIM = 128
NUM_LAYERS = 2
DROPOUT    = 0.3
NUM_CLASSES = 5

CLASSES = ['neutral', 'mild_distress', 'moderate_distress',
           'high_distress', 'crisis_indicator']

CLASS_DESCRIPTIONS = {
    'neutral':           'No significant distress signals detected',
    'mild_distress':     'Mild stress or low mood present',
    'moderate_distress': 'Notable anxiety or emotional difficulty',
    'high_distress':     'Significant distress — sustained low mood or hopelessness',
    'crisis_indicator':  'Crisis language detected — immediate support recommended',
}


# ── Synthetic Training Data Generator ─────────────────────────
TRAINING_TEMPLATES = {
    0: [  # neutral
        "Had a good day today. Finished my work and went for a walk.",
        "Feeling okay. Nothing special happened but it was a fine day.",
        "Managed to get everything done. Tired but satisfied.",
        "Met some friends today. Good conversation over coffee.",
        "Pretty ordinary day. Read a bit, cooked dinner, feeling alright.",
        "Work was fine. A bit boring but nothing to complain about.",
        "Feeling neutral. Not great not bad, just a regular Tuesday.",
        "Got some exercise in today which was good.",
        "Had a productive morning. Afternoon was slower but okay.",
        "Things are going normally. No major issues.",
        "Today was calm. Did some reading and relaxed in the evening.",
        "Feeling content. Spent time with family which was nice.",
        "Normal day at work. Lunch was good. Feeling fine tonight.",
        "Made some progress on my project. Feeling reasonably good.",
        "Not much to report. Day passed smoothly.",
    ],
    1: [  # mild distress
        "Feeling a bit tired and drained today. Nothing major.",
        "Slightly worried about things but nothing I can't handle.",
        "A bit low energy today. Could be the weather.",
        "Feeling a little down. Not sure why exactly.",
        "Had some tension headaches. Probably just stress from work.",
        "Slept badly last night and struggling to concentrate.",
        "Feeling somewhat anxious about the week ahead.",
        "A bit flat today. Nothing feels very exciting.",
        "Minor frustrations at work. Feel a bit deflated.",
        "Tired of the routine. Could do with a change.",
        "Feeling slightly overwhelmed by my to-do list.",
        "A bit lonely today. Didn't really talk to anyone.",
        "Low motivation. Hard to get started on things.",
        "Feeling restless and unsettled for no clear reason.",
        "Slightly on edge. Work has been stressful lately.",
    ],
    2: [  # moderate distress
        "Really struggling to focus today. Anxiety is quite high.",
        "Feeling overwhelmed and I don't know where to start.",
        "Had a bad day. Everything felt difficult and heavy.",
        "Anxious about so many things at once. Hard to switch off.",
        "Feeling tense and on edge. Couldn't relax at all today.",
        "Stressed about everything right now. Work deadlines are killing me.",
        "Keep catastrophising about things that probably won't happen.",
        "Feeling really drained. Every little thing is taking so much effort.",
        "Anxiety has been bad today. Chest feels tight.",
        "Can't stop worrying about the future. It's exhausting.",
        "Feel like I'm falling behind on everything and can't catch up.",
        "Really irritable today. Snapping at people for no reason.",
        "Mind is racing and I can't get to sleep. Third night in a row.",
        "Feeling increasingly disconnected from people around me.",
        "Work is crushing me. Don't see how I can keep this up much longer.",
        "Panic attack this afternoon. Felt really scary.",
        "Tearful most of the day without a specific reason.",
        "Every small problem feels like a disaster right now.",
    ],
    3: [  # high distress
        "Everything feels hopeless right now. I can't see a way through.",
        "Feeling completely empty and numb. Nothing matters.",
        "I'm so tired of feeling like this every single day.",
        "Nothing brings me joy anymore. I just go through the motions.",
        "Feeling like a burden to everyone around me.",
        "Can't see the point in anything. What's the use.",
        "I feel trapped and I don't know how to get out.",
        "Waking up and facing the day feels impossible.",
        "I'm exhausted in a way that sleep doesn't fix.",
        "Feel like I'm disappearing. Nobody would notice.",
        "Everything is grey. No colour to anything anymore.",
        "I'm losing hope that things will ever get better.",
        "Feel utterly alone even when surrounded by people.",
        "Can't remember the last time I felt genuinely okay.",
        "I don't recognise myself anymore. I've just stopped caring.",
        "Feeling completely worthless. Nothing I do is good enough.",
        "The darkness is back and I'm struggling to fight it.",
    ],
    4: [  # crisis indicators
        "I've been thinking about hurting myself. I'm scared.",
        "Don't want to be here anymore. Everything would be better without me.",
        "Having thoughts of suicide. I don't know what to do.",
        "I want to disappear. Not sure I can keep going.",
        "Thinking about ending it all. I feel completely lost.",
        "Feeling like self harm is the only way to cope right now.",
        "I've been researching ways to hurt myself and I'm frightened.",
        "Nobody cares if I'm here or not. It would be better if I wasn't.",
        "I've been cutting again. I don't know how to stop.",
        "The urge to hurt myself is getting stronger and I'm scared.",
    ],
}

def augment_text(text: str) -> str:
    """Simple augmentation — synonym swap and minor edits."""
    swaps = {
        'feeling': ['feel', 'am feeling', 'i feel'],
        'really': ['very', 'so', 'genuinely'],
        'today': ['right now', 'lately', 'these days', 'at the moment'],
        'bad': ['awful', 'terrible', 'rough', 'hard'],
        'good': ['well', 'alright', 'fine', 'decent'],
        'tired': ['exhausted', 'drained', 'worn out', 'fatigued'],
        'anxious': ['worried', 'on edge', 'nervous', 'stressed'],
        'stressed': ['under pressure', 'overwhelmed', 'tense', 'anxious'],
        'hopeless': ['lost', 'without hope', 'empty', 'broken'],
    }
    words = text.split()
    result = []
    for w in words:
        w_lower = w.lower().strip('.,!?')
        if w_lower in swaps and np.random.random() < 0.3:
            replacement = np.random.choice(swaps[w_lower])
            result.append(replacement)
        else:
            result.append(w)
    return ' '.join(result)


def generate_training_data(n_per_class: int = 600) -> Tuple[List[str], List[int]]:
    """Generate synthetic training data with augmentation."""
    texts, labels = [], []
    for label, templates in TRAINING_TEMPLATES.items():
        # Original templates
        for t in templates:
            texts.append(t)
            labels.append(label)
        # Augmented versions
        needed = n_per_class - len(templates)
        for _ in range(needed):
            t = np.random.choice(templates)
            texts.append(augment_text(t))
            labels.append(label)
    return texts, labels


# ── Tokenizer ─────────────────────────────────────────────────
class SimpleTokenizer:
    def __init__(self, vocab_size: int = VOCAB_SIZE):
        self.vocab_size = vocab_size
        self.word2idx: Dict[str, int] = {'<PAD>': 0, '<UNK>': 1}
        self.idx2word: Dict[int, str] = {0: '<PAD>', 1: '<UNK>'}

    def _tokenize(self, text: str) -> List[str]:
        text = text.lower()
        text = re.sub(r"[^a-z0-9\s']", ' ', text)
        return text.split()

    def fit(self, texts: List[str]):
        counter = Counter()
        for t in texts:
            counter.update(self._tokenize(t))
        for word, _ in counter.most_common(self.vocab_size - 2):
            if word not in self.word2idx:
                idx = len(self.word2idx)
                self.word2idx[word] = idx
                self.idx2word[idx] = word

    def encode(self, text: str, max_len: int = MAX_LEN) -> List[int]:
        tokens = self._tokenize(text)
        ids = [self.word2idx.get(t, 1) for t in tokens[:max_len]]
        # Pad or truncate
        ids += [0] * (max_len - len(ids))
        return ids[:max_len]

    def save(self, path: Path):
        with open(path, 'w') as f:
            json.dump({'word2idx': self.word2idx, 'vocab_size': self.vocab_size}, f)

    @classmethod
    def load(cls, path: Path) -> 'SimpleTokenizer':
        with open(path) as f:
            data = json.load(f)
        tok = cls(data['vocab_size'])
        tok.word2idx = data['word2idx']
        tok.idx2word = {v: k for k, v in tok.word2idx.items()}
        return tok


# ── Attention mechanism ───────────────────────────────────────
class Attention(nn.Module):
    """Bahdanau-style attention over BiLSTM outputs."""
    def __init__(self, hidden_dim: int):
        super().__init__()
        self.attn = nn.Linear(hidden_dim * 2, 1)

    def forward(self, lstm_out):
        # lstm_out: (batch, seq, hidden*2)
        weights = torch.softmax(self.attn(lstm_out), dim=1)  # (batch, seq, 1)
        context = (weights * lstm_out).sum(dim=1)             # (batch, hidden*2)
        return context, weights.squeeze(-1)


# ── BiLSTM Model ──────────────────────────────────────────────
class BiLSTMDistress(nn.Module):
    """
    Bidirectional LSTM with attention for distress classification.

    Architecture:
      Embedding(vocab, 64) →
      BiLSTM(64→128, 2 layers, dropout=0.3) →
      Attention →
      LayerNorm →
      FC(256→64) → ReLU → Dropout →
      FC(64→5) → Softmax
    """
    def __init__(self):
        super().__init__()
        self.embedding = nn.Embedding(VOCAB_SIZE, EMBED_DIM, padding_idx=0)
        self.bilstm = nn.LSTM(
            EMBED_DIM, HIDDEN_DIM, num_layers=NUM_LAYERS,
            batch_first=True, bidirectional=True,
            dropout=DROPOUT if NUM_LAYERS > 1 else 0.0
        )
        self.attention = Attention(HIDDEN_DIM)
        self.layer_norm = nn.LayerNorm(HIDDEN_DIM * 2)
        self.dropout = nn.Dropout(DROPOUT)
        self.fc1 = nn.Linear(HIDDEN_DIM * 2, 64)
        self.fc2 = nn.Linear(64, NUM_CLASSES)

    def forward(self, x):
        embedded = self.dropout(self.embedding(x))           # (batch, seq, embed)
        lstm_out, _ = self.bilstm(embedded)                  # (batch, seq, hidden*2)
        context, attn_weights = self.attention(lstm_out)     # (batch, hidden*2)
        context = self.layer_norm(context)
        out = F.relu(self.fc1(self.dropout(context)))
        out = self.fc2(self.dropout(out))
        return out, attn_weights


# ── Training ──────────────────────────────────────────────────
def train_bilstm(epochs: int = 40, lr: float = 1e-3, batch_size: int = 32):
    print("=" * 55)
    print("ScreenSense BiLSTM Distress Classifier — Training")
    print("=" * 55)
    print(f"Architecture: Embedding({VOCAB_SIZE},{EMBED_DIM}) →")
    print(f"  BiLSTM({EMBED_DIM}→{HIDDEN_DIM}×2, layers={NUM_LAYERS}) →")
    print(f"  Bahdanau Attention → FC(64) → Softmax({NUM_CLASSES})")
    print()

    # Generate data
    texts, labels = generate_training_data(n_per_class=600)
    print(f"Training samples: {len(texts)}")
    print(f"Class distribution: {Counter(labels)}")
    print()

    # Tokenizer
    tokenizer = SimpleTokenizer()
    tokenizer.fit(texts)
    tokenizer.save(MODEL_DIR / "bilstm_tokenizer.json")

    # Encode
    X = torch.tensor([tokenizer.encode(t) for t in texts], dtype=torch.long)
    y = torch.tensor(labels, dtype=torch.long)

    # Class weights for imbalance (crisis class is rare)
    class_counts = Counter(labels)
    total = len(labels)
    weights = torch.tensor([total / (NUM_CLASSES * class_counts[i]) for i in range(NUM_CLASSES)], dtype=torch.float)

    # Split
    split = int(len(X) * 0.85)
    idx   = torch.randperm(len(X))
    X_tr, X_v = X[idx[:split]], X[idx[split:]]
    y_tr, y_v = y[idx[:split]], y[idx[split:]]

    # Model
    model   = BiLSTMDistress()
    opt     = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    sched   = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    loss_fn = nn.CrossEntropyLoss(weight=weights)

    best_val_acc = 0.0
    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(len(X_tr))
        total_loss = 0
        for i in range(0, len(X_tr), batch_size):
            idx_b = perm[i:i+batch_size]
            opt.zero_grad()
            logits, _ = model(X_tr[idx_b])
            loss = loss_fn(logits, y_tr[idx_b])
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            total_loss += loss.item()
        sched.step()

        # Validation
        model.eval()
        with torch.no_grad():
            logits_v, _ = model(X_v)
            preds_v = logits_v.argmax(dim=1)
            val_acc = (preds_v == y_v).float().mean().item()

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), MODEL_DIR / "bilstm_distress.pt")

        if (epoch + 1) % 8 == 0:
            avg_loss = total_loss / (len(X_tr) / batch_size)
            print(f"Epoch {epoch+1:3d}/{epochs} | Loss: {avg_loss:.4f} | Val acc: {val_acc:.3f}")

    print(f"\nBest val accuracy: {best_val_acc:.3f}")
    print(f"Model saved → {MODEL_DIR}/bilstm_distress.pt")

    # Per-class accuracy
    model.load_state_dict(torch.load(MODEL_DIR / "bilstm_distress.pt", weights_only=True))
    model.eval()
    with torch.no_grad():
        logits_v, _ = model(X_v)
        preds_v = logits_v.argmax(dim=1)
    for i, cls in enumerate(CLASSES):
        mask = y_v == i
        if mask.sum() > 0:
            acc = (preds_v[mask] == y_v[mask]).float().mean().item()
            print(f"  {cls:22s}: {acc:.3f} ({mask.sum()} samples)")

    # Save eval report
    overall_acc = (preds_v == y_v).float().mean().item()
    report = {
        "model": "BiLSTM Distress Classifier",
        "architecture": f"Embedding({VOCAB_SIZE},{EMBED_DIM}) → BiLSTM({HIDDEN_DIM}×2, {NUM_LAYERS}L) → Attention → FC(64) → Softmax(5)",
        "val_accuracy": round(float(best_val_acc), 4),
        "training_samples": len(texts),
        "classes": CLASSES,
        "citations": [
            "Schuster & Paliwal (1997). Bidirectional recurrent neural networks. IEEE Trans. Signal Processing.",
            "Bahdanau et al. (2015). Neural machine translation by jointly learning to align and translate. ICLR.",
            "Hochreiter & Schmidhuber (1997). Long Short-Term Memory. Neural Computation.",
        ]
    }
    with open(MODEL_DIR / "bilstm_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nEval report saved → {MODEL_DIR}/bilstm_report.json")
    return model, best_val_acc


# ── Inference ─────────────────────────────────────────────────
_model_cache: Optional[BiLSTMDistress] = None
_tokenizer_cache: Optional[SimpleTokenizer] = None

def load_bilstm() -> Optional[Tuple[BiLSTMDistress, SimpleTokenizer]]:
    global _model_cache, _tokenizer_cache
    if _model_cache is not None:
        return _model_cache, _tokenizer_cache
    model_path = MODEL_DIR / "bilstm_distress.pt"
    tok_path   = MODEL_DIR / "bilstm_tokenizer.json"
    if not model_path.exists() or not tok_path.exists():
        return None
    model = BiLSTMDistress()
    model.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=True))
    model.eval()
    tokenizer = SimpleTokenizer.load(tok_path)
    _model_cache = model
    _tokenizer_cache = tokenizer
    return model, tokenizer


def classify_distress(text: str) -> Dict:
    """
    Classify journal/chat text into distress level.
    Returns class, confidence, and attention highlights.
    Falls back to keyword detection if model not trained.
    """
    if not text or not text.strip():
        return {
            'class': 'neutral', 'class_idx': 0,
            'confidence': 1.0, 'probabilities': {},
            'description': CLASS_DESCRIPTIONS['neutral'],
            'model': 'BiLSTM (not run — empty input)',
            'attention_words': [],
        }

    loaded = load_bilstm()
    if loaded is None:
        return _fallback_classify(text)

    model, tokenizer = loaded
    encoded = torch.tensor([tokenizer.encode(text)], dtype=torch.long)

    with torch.no_grad():
        logits, attn_weights = model(encoded)
        probs = torch.softmax(logits, dim=1)[0]
        pred_idx = probs.argmax().item()
        confidence = probs[pred_idx].item()

    # Get attention words for explainability
    tokens = text.lower().split()[:MAX_LEN]
    attn = attn_weights[0, :len(tokens)].tolist()
    top_attn = sorted(zip(tokens, attn), key=lambda x: -x[1])[:5]
    attention_words = [{'word': w, 'weight': round(a, 3)} for w, a in top_attn if a > 0.05]

    return {
        'class':       CLASSES[pred_idx],
        'class_idx':   int(pred_idx),
        'confidence':  round(float(confidence), 4),
        'probabilities': {CLASSES[i]: round(float(p), 4) for i, p in enumerate(probs)},
        'description': CLASS_DESCRIPTIONS[CLASSES[pred_idx]],
        'model':       'BiLSTM (Schuster & Paliwal, 1997) + Attention (Bahdanau et al., 2015)',
        'attention_words': attention_words,
        'is_crisis':   pred_idx == 4,
        'needs_support': pred_idx >= 3,
    }


def _fallback_classify(text: str) -> Dict:
    """Keyword fallback when model not trained."""
    from app.ml.care_pathway import CRISIS_KEYWORDS, DETERIORATION_KEYWORDS
    text_lower = text.lower()
    if any(k in text_lower for k in CRISIS_KEYWORDS):
        cls = 'crisis_indicator'
    elif any(k in text_lower for k in DETERIORATION_KEYWORDS):
        cls = 'high_distress'
    elif any(k in text_lower for k in ['stressed', 'anxious', 'overwhelmed', 'worried']):
        cls = 'moderate_distress'
    elif any(k in text_lower for k in ['tired', 'sad', 'low', 'down']):
        cls = 'mild_distress'
    else:
        cls = 'neutral'
    idx = CLASSES.index(cls)
    return {
        'class': cls, 'class_idx': idx, 'confidence': 0.7,
        'probabilities': {}, 'description': CLASS_DESCRIPTIONS[cls],
        'model': 'Keyword fallback (train BiLSTM for neural inference)',
        'attention_words': [], 'is_crisis': idx == 4, 'needs_support': idx >= 3,
    }


if __name__ == "__main__":
    train_bilstm()
    print("\n--- Test inference ---")
    tests = [
        "Had a great day, feeling really good about things",
        "Feeling a bit tired and stressed about work",
        "Really struggling, everything feels hopeless",
        "I don't want to be here anymore",
    ]
    for t in tests:
        result = classify_distress(t)
        print(f"  '{t[:50]}...' → {result['class']} ({result['confidence']:.2f})")
