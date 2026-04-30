# ScreenSense — Personalised Digital Wellbeing Application

> A context-aware digital wellbeing prototype that combines mood tracking, behavioural signals, machine learning, and personalised recommendations to support healthier digital habits and short-term emotional awareness.

**Student:** Harrison Scott  
**Student ID:** 10805603  
**Course:** BSc Computer Science  
**University:** University of Plymouth  
**Module:** COMP3000 Computing Project  
**Academic Year:** 2025–26  
**Repository:** https://github.com/Harrisonscott9970/ScreenSense  

![Python](https://img.shields.io/badge/Python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green)
![React Native](https://img.shields.io/badge/React_Native-Expo-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-Mobile-blue)
![PyTorch](https://img.shields.io/badge/PyTorch-ML-red)
![scikit-learn](https://img.shields.io/badge/scikit--learn-ML-orange)

---

## 1. Project Overview

ScreenSense is a mobile digital wellbeing application designed to help students and young adults manage screen time, build healthier habits, and receive personalised wellbeing support.

The project was developed as a full-stack software engineering and machine learning prototype. It combines a React Native / Expo mobile frontend, a FastAPI backend, local model training/inference, and a recommendation engine that provides adaptive wellbeing suggestions based on user mood, behavioural signals, journal input, and contextual information.

The application is intended to go beyond generic wellbeing advice by responding to the user’s current state. Instead of only giving fixed suggestions such as “take a break” or “go outside”, ScreenSense aims to use user data and machine learning outputs to provide more relevant recommendations.

ScreenSense is a research prototype and digital wellbeing support tool. It is not a medical device and does not diagnose, treat, or replace professional mental health support.

---

## 2. Project Vision

For students and young adults who spend a significant amount of time on digital devices and may struggle with screen-time balance, digital fatigue, motivation, or wellbeing consistency, ScreenSense is a mobile wellbeing application that supports healthier digital habits through mood tracking, personalised nudges, reminders, challenges, and AI-informed recommendations.

The project aims to help users become more aware of their screen-time behaviours and emotional patterns. It provides suggestions such as goals, places to visit, reflection prompts, and supportive actions. The long-term vision is to create a privacy-conscious app that motivates positive behaviour without using manipulative or excessive notifications.

The original project vision was:

> This project aims to help students and young adults who spend a lot of time on their devices. The wellbeing app is a mobile app designed to help users manage their screen time, build healthier habits, and stay motivated through reminders, challenges and personalised nudges. The app will track users' behaviour, and provide AI-informed suggestions, locations to go and goals. It will also reward positive behaviour in a privacy-conscious way.

This vision evolved during development into a stronger focus on personalised wellbeing recommendations, mood awareness, contextual support, and machine learning-assisted decision making.

---

## 3. Problem Domain

Many digital wellbeing applications provide generalised advice that is not strongly personalised to the individual user. For example, an app may suggest taking a break, reducing screen time, or going outside, but it may not consider the user’s current mood, recent emotional pattern, behavioural context, or journal input.

This creates a gap between generic wellbeing advice and support that adapts to the user’s situation.

ScreenSense addresses this problem by using multiple signals, including:

- mood check-ins
- journal entries
- behavioural indicators
- stress-related inputs
- location/contextual information
- previous mood trends
- recommendation history

The goal is to explore whether context-aware and machine-learning-assisted recommendations can feel more relevant than a static rule-based approach.

---

## 4. Aim and Objectives

### Aim

To design, implement, and evaluate a personalised digital wellbeing application that uses machine learning and contextual data to generate adaptive short-term wellbeing recommendations.

### Objectives

1. Review relevant literature and context around digital wellbeing, screen-time behaviour, mood tracking, machine learning, recommendation systems, and ethical handling of wellbeing data.
2. Design a mobile application that supports mood check-ins, journal input, wellbeing recommendations, and user interaction through a clear and accessible interface.
3. Implement a full-stack architecture using a React Native / Expo frontend and a FastAPI backend.
4. Develop backend services for API routing, validation, model inference, database interaction, and recommendation generation.
5. Implement and integrate machine learning models for stress classification, mood trend prediction, and journal distress classification.
6. Build a recommendation engine that combines machine learning outputs and rule-based logic to generate personalised wellbeing suggestions.
7. Compare personalised recommendations with a simpler static/rule-based baseline.
8. Evaluate the system using software testing, model evaluation metrics, and critical reflection.
9. Consider legal, social, ethical, and professional issues, including privacy, consent, data minimisation, responsible AI, and GDPR awareness.

---

## 5. Research Question

Can a personalised, context-aware wellbeing recommendation system provide more relevant short-term support than a static rule-based recommendation approach?

---

## 6. Key Features

ScreenSense currently includes or is designed around the following features:

- Mobile wellbeing interface built with React Native / Expo
- Mood and wellbeing check-in flow
- Journal entry input and analysis
- Personalised recommendation generation
- Rule-based baseline recommendation logic
- Random Forest stress classification model
- LSTM mood trend prediction model
- BiLSTM with Attention journal distress classification model
- Local model training and loading support
- FastAPI backend with Swagger documentation
- Backend control panel for running the app and training AI models
- Python-based backend services
- TypeScript-based mobile frontend
- Testing support through pytest
- Privacy-conscious design approach
- Ethical disclaimer and non-clinical framing

---

## 7. Repository Structure

```text
ScreenSense/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── ml/
│   │   ├── models/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── config.py
│   │   └── main.py
│   │
│   ├── data/
│   ├── tests/
│   ├── .env.example
│   ├── requirements.txt
│   └── render.yaml
│
├── screensense-app/
│   ├── assets/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── screens/
│   │   ├── services/
│   │   └── utils/
│   │
│   ├── App.tsx
│   ├── package.json
│   └── tsconfig.json
│
├── control_panel.pyw
├── ScreenSense Control Panel.bat
├── setup_demo.py
├── start.sh
└── README.md
```

---

## 8. System Architecture

ScreenSense uses a layered architecture to separate the mobile interface, backend logic, machine learning layer, and recommendation system.

```text
┌─────────────────────────────────────────────────────┐
│                React Native / Expo App              │
│                                                     │
│   Mood Check-in | Journal | Scout | Insights        │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ HTTP / JSON API
                        ▼
┌─────────────────────────────────────────────────────┐
│                  FastAPI Backend                    │
│                                                     │
│  API Routes | Validation | Services | Database      │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                Machine Learning Layer               │
│                                                     │
│  Random Forest       → Stress classification         │
│  LSTM                → Mood trend prediction         │
│  BiLSTM + Attention  → Journal distress class        │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              Recommendation Engine                  │
│                                                     │
│ Combines model outputs, user context, and rules      │
│ to generate personalised wellbeing suggestions.      │
└─────────────────────────────────────────────────────┘
```

This separation supports maintainability because frontend screens, API logic, data models, machine learning code, and recommendation services are not all placed in one monolithic file.

---

## 9. Technology Stack

| Area | Technology |
|---|---|
| Frontend | React Native, Expo, TypeScript |
| Backend | Python, FastAPI |
| API Validation | Pydantic |
| Database / Data Layer | SQLAlchemy / local data storage |
| Machine Learning | scikit-learn, PyTorch |
| Data Processing | NumPy, pandas |
| Explainability | SHAP |
| Testing | pytest |
| Development Tools | GitHub, VS Code, PowerShell |
| Control Utilities | Python control panel and batch launcher |
| Deployment Target | Render backend, Expo/EAS frontend |

---

## 10. Methodology

The project followed an Agile-inspired iterative development methodology. This was appropriate because ScreenSense involved several interacting areas of work:

- mobile app development
- backend API development
- machine learning model training
- recommendation logic
- testing and evaluation
- ethical and privacy considerations
- documentation and presentation

A linear Waterfall approach would have been less suitable because the technical requirements changed as the system developed. For example, the project began with a broad screen-time and wellbeing vision, but the final implementation became more focused on personalised recommendations, mood tracking, machine learning inference, and context-aware support.

The project was therefore developed through repeated cycles of research, planning, design, implementation, testing, review, and refinement.

---

## 11. Project Planning

The project was planned using a structured timeline covering research, proposal work, design, implementation, testing, report writing, and final preparation.

The original plan included the following major phases:

| Phase | Focus |
|---|---|
| Research and idea refinement | Defining the project area and identifying the problem |
| Supervisor selection and proposal | Establishing project direction and academic framing |
| UI/UX design and prototyping | Designing how the user would interact with the app |
| Ethical and legal checks | Considering privacy, GDPR, responsible design, and data risks |
| Core app development | Building the main mobile and backend functionality |
| Database and AI integration | Connecting user data, models, and recommendation logic |
| Testing and iteration | Checking functionality, fixing issues, and improving reliability |
| Quality assurance and user testing | Reviewing usability and correctness |
| Poster and report preparation | Preparing final academic evidence |
| Final submission and showcase | Finalising software and documentation |
| Viva preparation and delivery | Preparing to explain and defend the project |

This plan gave the project a clear structure from early research through to delivery.

---

## 12. Risk Management

A risk plan was created to identify possible issues that could affect the project. The main risks included schedule delays, technical issues, AI implementation difficulty, data privacy/GDPR compliance, device or software failure, motivation/burnout, limited access to testers, delays in feedback, integration issues, and possible changes in project scope.

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Falling behind schedule | High | Low/Medium | Follow the Gantt chart, use milestones, prioritise core features |
| Technical issues or bugs | High | High | Regular testing and GitHub version control |
| AI feature difficulty | Medium | Medium | Start with a basic AI implementation, then enhance after MVP stability |
| Data privacy and GDPR compliance | High | Low/Medium | Minimise data collection, store data securely, anonymise sensitive data |
| Device or software failure | Medium/High | High | Keep frequent backups using GitHub and OneDrive |
| Motivation or burnout | Low | Medium | Set realistic targets and take breaks |
| Limited access to testers | Medium | Medium | Use friends, family, and course mates as testers |
| Delays in feedback or unclear requirements | High | Low | Communicate with supervisor and document meeting notes |
| Integration issues with mobile features/APIs | High | Low/Medium | Add components early and test frequently |
| Scope changes | Medium | Low/Medium | Manage requirements carefully and review with supervisor |

The risk plan was useful because several risks did affect the project in practice, particularly technical issues, time pressure, and the need to rebuild parts of the project.

---

## 13. Project Management Reflection

During development, the project experienced a significant setback in early February when parts of the project were lost or had to be rebuilt. This affected the original timeline and required a change in priorities.

The response was to focus first on restoring the core working system, including the backend, frontend, AI model pipeline, and recommendation features. This meant some later-stage activities, such as final quality review, extra testing, and polish, had less time than originally planned.

This was an important project management lesson. Although the original risk plan identified technical issues, software failure, and the need for backups, the experience showed that more time should have been allocated near the end of the project for contingency, quality assurance, documentation improvement, and final testing.

As a result, future projects would benefit from more frequent backup checks, earlier creation of stable release versions, more time reserved for final quality assurance, smaller feature milestones, earlier testing of deployment and integration risks, and clearer separation between core, optional, and stretch features.

This reflection demonstrates that the project plan was not treated as fixed. It was adapted in response to real implementation issues, which is important for an Agile-style project.

---

## 14. Control Panel and Development Workflow

ScreenSense includes a control panel workflow to make development and testing easier.

The control panel is used to:

- start the backend server
- run the mobile app development environment
- train or retrain the AI models
- manage setup/demo tasks
- reduce the amount of manual command-line work needed during development

This was useful because the project contains multiple moving parts. Running the frontend, backend, and machine learning tools separately can be time-consuming and error-prone. The control panel helps centralise these actions and makes the project easier to demonstrate.

Relevant files include:

```text
control_panel.pyw
ScreenSense Control Panel.bat
setup_demo.py
start.sh
```

The control panel also supports the project’s software engineering quality because it improves repeatability. Instead of relying on remembering multiple commands, common development actions can be run from a single place.

---

## 15. Implementation

### 15.1 Backend

The backend is implemented using FastAPI. It handles the server-side logic, API routes, validation, service layer, model loading, and recommendation generation.

FastAPI was chosen because it provides automatic API documentation through Swagger, clean routing structure, Pydantic validation, good performance, support for asynchronous API behaviour, and a maintainable structure for a growing project.

The backend is organised into separate folders for API routes, machine learning, models, services, utilities, and configuration. This is better than a single-file backend because it makes the system easier to maintain, test, and extend.

### 15.2 Frontend

The frontend is implemented using React Native with Expo. This allows ScreenSense to be developed as a mobile application using a single TypeScript-based codebase.

React Native / Expo was selected because it supports rapid mobile prototyping, reusable components, cross-platform development, integration with mobile-style UI flows, and easier testing through Expo tools.

The frontend is structured into components, screens, hooks, services, and utility functions. This helps separate interface code from API logic and general helper functions.

### 15.3 Machine Learning

The project includes three main machine learning components.

| Model | Purpose | Input | Output |
|---|---|---|---|
| Random Forest | Stress classification | Behavioural/contextual features | Stress class or score |
| LSTM | Mood prediction | Previous mood sequence | Predicted mood trend/valence |
| BiLSTM + Attention | Journal distress classification | Journal text | Distress class |

The Random Forest model is suitable for structured behavioural/contextual data because it is interpretable compared with many deep learning methods and can handle mixed input features effectively.

The LSTM model is suitable for mood sequence prediction because mood changes over time and previous mood entries can influence later predictions.

The BiLSTM with Attention model is suitable for journal distress classification because text has sequential meaning, and attention helps the model focus on important parts of the input.

### 15.4 Recommendation Engine

The recommendation engine combines machine learning outputs with rule-based logic.

For example:

- If stress is high and mood is low, the app may suggest a calming activity.
- If mood has declined over recent entries, the app may suggest reflection or a supportive action.
- If journal distress is high, the app may recommend a stronger support step.
- If the user appears stable, the app may suggest a lighter wellbeing action.

This creates a more adaptive system than static advice alone.

---

## 16. Baseline Comparison

A rule-based baseline is important because it gives the personalised system something to compare against.

A static rule-based wellbeing app might use simple logic such as:

```text
IF mood is low THEN recommend breathing exercise
IF screen time is high THEN recommend taking a break
IF user is tired THEN recommend rest
```

This is easy to understand and safer to control, but it does not adapt deeply to the user’s pattern over time.

ScreenSense improves on this by combining current mood, recent mood trend, stress classification, journal distress classification, contextual information, and recommendation logic.

This allows the system to generate recommendations that are more personalised to the current user state.

---

## 17. Model Evaluation

The current model evaluation evidence includes approximate prototype-level results:

| Model | Evaluation Evidence |
|---|---|
| Random Forest | Stress classification accuracy of approximately 78% |
| LSTM | Mood prediction validation MSE of approximately 0.08 |
| BiLSTM + Attention | Journal distress classification accuracy of approximately 85% |

These results show that the models are functioning as part of the prototype. However, they should be interpreted carefully because the project is not a clinical system and model quality depends heavily on the training data.

A larger real-world dataset and more user testing would be required before making strong claims about general performance.

---

## 18. Testing and Validation

Testing was considered at several levels of the system.

### Backend Testing

Backend testing focuses on API endpoint availability, response format, input validation, model loading, recommendation output consistency, error handling, and database/service behaviour.

Backend tests can be run with:

```bash
cd backend
pytest tests/ -v --tb=short
```

### Frontend Testing

Frontend testing focuses on navigation between screens, mood check-in flow, journal input, recommendation display, error handling if the backend is unavailable, and visual consistency across screens.

### Machine Learning Validation

Machine learning validation considers accuracy, F1 score where appropriate, confusion matrix inspection, validation loss/MSE, comparison with rule-based baseline behaviour, and checking whether outputs are reasonable for sample scenarios.

### System Validation

The system is validated by checking whether the final implementation meets the project objectives.

| Objective | Status |
|---|---|
| Full-stack app implemented | Achieved |
| React Native / Expo frontend implemented | Achieved |
| FastAPI backend implemented | Achieved |
| Multiple ML models developed | Achieved |
| Recommendation engine implemented | Achieved |
| Control panel workflow included | Achieved |
| Testing evidence included | Partially achieved / ongoing |
| Ethical and privacy issues considered | Achieved |
| Full real-world user study completed | Limited / future work |

---

## 19. Critical Evaluation

ScreenSense successfully demonstrates a working full-stack wellbeing prototype with machine learning integration. The project goes beyond a simple data entry app because it combines a mobile frontend, backend API, machine learning models, recommendation logic, and a development control panel.

### Strengths

- Clear problem domain focused on digital wellbeing and student screen-time behaviour
- Full-stack architecture with separate frontend and backend
- Multiple machine learning models for different input types
- Recommendation engine that combines model outputs and rules
- Control panel to simplify development and AI training workflow
- Privacy-conscious design principles
- Non-clinical and responsible framing
- Expandable project structure
- Good basis for further research and user testing

### Limitations

- Limited real-world user testing
- Some training data may be synthetic or limited in size
- Model performance may not generalise to all users
- Recommendations should not be interpreted as clinical advice
- More time was needed for final quality assurance and polish
- Deployment, authentication, and secure production storage would require more work
- The app would need stronger longitudinal testing to prove long-term wellbeing impact

### Reflection on Outcome

The final project demonstrates the main technical goals: a mobile app, backend API, AI model pipeline, recommendation logic, and control tooling. The largest weakness is not the concept, but the limited time available for final refinement after technical setbacks.

The project therefore succeeds as a research and software prototype, while also identifying clear future work before it could become a real deployed wellbeing product.

---

## 20. Legal, Social, Ethical and Professional Issues

ScreenSense handles wellbeing-related information, so legal, social, ethical, and professional issues are central to the project.

### Legal

The project is designed with GDPR awareness. The system should minimise personal data collection and avoid unnecessary storage of sensitive information.

The original legal plan stated that user data would be stored locally where possible. If cloud syncing were added in future, sensitive information should be anonymised and encrypted.

Key legal considerations include data minimisation, user consent, secure storage, anonymisation where possible, purpose limitation, responsible handling of emotional data, and clear privacy information for users.

### Ethical

The app is intended to support healthier behaviour, not manipulate users or create dependency. Notifications and nudges should be supportive, limited, and respectful.

The system should avoid overclaiming medical benefit, diagnosing mental health conditions, creating guilt around screen time, manipulative engagement loops, and unsafe or overly confident AI responses.

ScreenSense should present recommendations as supportive suggestions rather than instructions or clinical advice.

### Social

The project aims to support positive digital behaviour, reduce digital fatigue, and help students and young adults find a better balance between screen use and offline activities.

However, social risks must also be considered. For example, users may interpret recommendations differently depending on their situation, and wellbeing advice should be inclusive, accessible, and sensitive to different user needs.

### Professional

The project uses version control, structured folders, documentation, testing, and an Agile-inspired workflow. Professional practice also includes acknowledging limitations, avoiding unsafe claims, and designing the system in a maintainable way.

The control panel, backend structure, and separate frontend organisation all support professional software development because they improve repeatability and maintainability.

---

## 21. Safety and Clinical Disclaimer

ScreenSense is a research prototype and digital wellbeing application.

It is not a medical device. It does not diagnose, treat, prevent, or cure any mental health condition. It is not a substitute for professional medical, psychological, or crisis support.

If a user is in immediate danger or experiencing a mental health crisis, they should contact emergency services or an appropriate crisis support service.

In the UK and Ireland, Samaritans can be contacted on 116 123.

---

## 22. Setup Instructions

### 22.1 Backend Setup

Move into the backend folder:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate the virtual environment:

```bash
# Windows
venv\Scripts\activate
```

```bash
# macOS / Linux
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

The API documentation should then be available at:

```text
http://localhost:8000/docs
```

### 22.2 Train Models Manually

If required, models can be trained manually using commands such as:

```bash
python -m app.ml.train
python -m app.ml.lstm_model
python -m app.ml.bilstm_distress
```

### 22.3 Frontend Setup

Move into the frontend folder:

```bash
cd screensense-app
```

Install dependencies:

```bash
npm install
```

Run the Expo development server:

```bash
npx expo start
```

### 22.4 Control Panel Workflow

On Windows, the project can also be managed through the included control panel files:

```text
ScreenSense Control Panel.bat
control_panel.pyw
```

The control panel is intended to make it easier to run the app, start services, and train AI models without manually typing every command.

---

## 23. Environment Variables

The backend includes an example environment file.

Copy it with:

```bash
cd backend
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Then update the `.env` file as required for the local environment.

---

## 24. Deployment Considerations

The project is structured with deployment in mind, but production deployment would require further hardening.

Potential deployment approach:

| Component | Possible Deployment |
|---|---|
| Backend | Render / Railway / Fly.io |
| Database | PostgreSQL |
| Frontend | Expo / EAS Build |
| API | HTTPS only |
| Secrets | Environment variables |
| User data | Secure database with access controls |

Before real deployment, the following improvements would be required:

- production CORS configuration
- authentication and user accounts
- secure password/session handling
- encrypted storage for sensitive data
- privacy policy and terms of use
- stronger logging and monitoring
- proper database migration strategy
- security review

---

## 25. Screenshots

---

## 26. Future Work

Future improvements could include:

- larger real-world user evaluation
- improved dataset quality
- better recommendation ranking
- stronger authentication
- encrypted user storage
- on-device inference for improved privacy
- integration with real screen-time APIs
- improved explainability dashboards
- longitudinal study of mood and recommendation effectiveness
- accessibility testing
- improved UI polish
- more robust deployment
- better separation between clinical escalation and general wellbeing suggestions
- improved backup and release management process

---

## 27. Academic Context and References

The project is informed by literature and concepts from machine learning, digital wellbeing, affect modelling, environmental psychology, recommendation systems, and responsible AI.

Key references include:

- Bahdanau, D., Cho, K. and Bengio, Y. (2015). Neural machine translation by jointly learning to align and translate. *International Conference on Learning Representations*.
- Breiman, L. (2001). Random forests. *Machine Learning*, 45, pp.5–32.
- Hochreiter, S. and Schmidhuber, J. (1997). Long short-term memory. *Neural Computation*, 9(8), pp.1735–1780.
- Kaplan, S. (1995). The restorative benefits of nature: Toward an integrative framework. *Journal of Environmental Psychology*, 15(3), pp.169–182.
- Lundberg, S.M. and Lee, S.I. (2017). A unified approach to interpreting model predictions. *Advances in Neural Information Processing Systems*.
- Russell, J.A. (1980). A circumplex model of affect. *Journal of Personality and Social Psychology*, 39(6), pp.1161–1178.
- Schuster, M. and Paliwal, K.K. (1997). Bidirectional recurrent neural networks. *IEEE Transactions on Signal Processing*, 45(11), pp.2673–2681.
- Ulrich, R.S. (1984). View through a window may influence recovery from surgery. *Science*, 224(4647), pp.420–421.
- NICE (2022). Common mental health problems: identification and pathways to care.

---

## 28. Conclusion

ScreenSense meets the project aim by delivering a working personalised digital wellbeing prototype with a mobile frontend, backend API, machine learning pipeline, recommendation engine, and development control panel.

The project demonstrates software engineering, machine learning implementation, ethical awareness, project planning, testing, and critical reflection. It also shows how a static wellbeing advice system can be extended into a more adaptive and personalised recommendation system.

The final implementation is not a finished commercial or clinical product, but it provides a strong research and development foundation for future work in personalised digital wellbeing applications.

---

## 29. Licence

MIT Licence.
