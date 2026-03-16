# ScreenSense — Digital Wellbeing App

> Context-aware digital wellbeing — affect sensing, ML stress classification, and personalised place recommendations.

**Harrison Scott · Student ID: 10805603 · BSc Computer Science · University of Plymouth · 2025-26**

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)](https://fastapi.tiangolo.com)
[![React Native](https://img.shields.io/badge/React_Native-Expo_54-purple)](https://expo.dev)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.4-red)](https://pytorch.org)

---

## What is ScreenSense?

ScreenSense is a clinical-grade digital wellbeing application that combines:

- **Real-time stress classification** using a trained Random Forest model
- **Longitudinal mood prediction** using a custom LSTM neural network  
- **Natural language distress detection** using a custom BiLSTM + Attention model
- **Environmental psychology** to recommend nearby restorative places
- **NHS stepped care model** for adaptive support levels
- **Scout AI** — a context-aware conversational wellbeing companion

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React Native App                    │
│  Check-in → Scout → Map → Therapy → Insights        │
└─────────────────┬───────────────────────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────────────────────┐
│              FastAPI Backend                         │
│  /checkin  /insights  /entries  /weekly-report       │
└────────────┬────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────┐
│           ML Pipeline (all local, no external AI)    │
│  Random Forest   →  stress score (0-1)               │
│  LSTM            →  next mood valence (-1 to +1)     │
│  BiLSTM+Attention→  distress class (0-4)             │
│  SHAP            →  feature importance explanation   │
│  Care Pathway    →  stepped care level (1-4)         │
└─────────────────────────────────────────────────────┘
```

---

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Train all models
python -m app.ml.train           # Random Forest
python -m app.ml.lstm_model      # LSTM
python -m app.ml.bilstm_distress # BiLSTM

# Start server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd screensense-app
npm install
npx expo start
```

### Environment variables

Copy `.env.example` to `.env` and fill in your values.

---

## ML Models

| Model | Type | Input | Output | Accuracy |
|-------|------|-------|--------|----------|
| Random Forest | Ensemble | Device signals (8 features) | Stress category | 78% |
| LSTM | Deep learning | 7-entry sequences | Mood valence | Val MSE 0.08 |
| BiLSTM + Attention | Deep learning | Journal text | Distress class (0-4) | ~85% |

### Academic citations
- Breiman, L. (2001). Random Forests. *Machine Learning*, 45, 5–32.
- Hochreiter, S. & Schmidhuber, J. (1997). Long Short-Term Memory. *Neural Computation*, 9(8).
- Schuster, M. & Paliwal, K.K. (1997). Bidirectional recurrent neural networks. *IEEE Trans. Signal Processing*.
- Bahdanau, D. et al. (2015). Neural machine translation by jointly learning to align and translate. *ICLR*.
- Lundberg, S.M. & Lee, S.I. (2017). A unified approach to interpreting model predictions. *NeurIPS*.
- Russell, J.A. (1980). A circumplex model of affect. *Journal of Personality and Social Psychology*.
- Kaplan, S. (1995). The restorative benefits of nature. *Journal of Environmental Psychology*.
- Ulrich, R.S. (1984). View through a window may influence recovery from surgery. *Science*.
- NICE (2022). Common mental health problems: identification and pathways to care.

---

## Running tests

```bash
cd backend
pytest tests/ -v --tb=short
```

---

## Deployment

See `render.yaml` for Render deployment configuration.

The app is designed to deploy to:
- **Backend**: Render free tier (FastAPI + PostgreSQL)
- **Frontend**: Expo EAS Build (iOS + Android) or web via `npx expo export`

---

## Clinical disclaimer

ScreenSense is a research prototype and digital wellbeing tool. It is not a medical device, does not diagnose any condition, and is not a substitute for professional mental health care. In crisis, contact Samaritans on 116 123.

---

## Licence

MIT Licence — see LICENSE file.
