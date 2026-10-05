# Course authoring: how SafeRehearse "learns" a course

> **Status.** Sections marked **(today)** describe what exists in the code now. Sections marked
> **(proposed)** are the design for the next step: course packs and an import command.

## 1. The key idea: we author, we don't train

When people say "train the AI on our course", they usually mean fine-tuning: changing a model's
weights with our material. **SafeRehearse deliberately does not do that.** Instead, for every
session the backend hands the model:

- the course content for that stage,
- instructions for the role it must play,
- the criteria it should gather evidence against.

The model is a capable general speaker. The **course pack** makes it an expert tutor for one
scenario, for the length of one session.

Why this is the right approach for us:

| Fine-tuning a model                           | Authoring a course pack (our approach)                |
| --------------------------------------------- | ----------------------------------------------------- |
| Tied to one provider and one model version    | Works with any provider (Principle 7)                 |
| Weeks, data pipelines, cost per retrain       | Edit text, re-import, test in minutes                 |
| Opaque: you can't see _why_ it said something | Every instruction and fact is readable and reviewable |
| Experts can't edit it                         | Safeguarding experts can review and edit plain text   |
| Can't prove what it was taught                | The pack _is_ the record of what it was taught        |

The **grade** never comes from the model's judgement. The model only records evidence; the backend
applies the expert's criteria (Principle 6). Authoring is how experts control _both_ what is taught
and how it is assessed.

## 2. Anatomy of a course

```text
Scenario                    e.g. "Safeguarding adults: responding to a disclosure"
└── Stage 1..n              the atomic learning unit (one voice session)
    ├── Learning objectives what the learner should be able to do afterwards
    ├── Knowledge           the facts the agent may teach from (the only source of truth)
    ├── Teacher brief       how to teach this stage
    ├── Practice brief      the role-play persona + situation, and how to give feedback
    ├── Examiner brief      the assessed role-play, and how to stay neutral
    └── Criteria            observable behaviours, each with: key, description,
                            required?, minConfidence
```

### How each part reaches the model (today)

The voice agent builds one system prompt per mode (`apps/voice-agent/src/agents/instructions.ts`):

```text
[Role line]           "You are the Teacher / Practice Partner / Examiner…"
[Ground rules]        short turns, UK English, only teach from the knowledge, never grade
[Scenario + stage]    titles
[Learning objectives] from the stage
[Instructions]        the brief for THIS mode, written by the course author
[Course knowledge]    every knowledge chunk for the stage
[Criteria]            Examiner only: "- reports-to-lead: States they will report to…"
```

The criteria keys also become the **only allowed values** of the Examiner's `record_evidence`
tool, so the model cannot invent a criterion.

So the quality of a session is almost entirely the quality of these texts. That is good news: it is
writing work, not machine-learning work.

## 3. Writing each part well

### Learning objectives

Write what the learner can **do**, not what they will "understand". Keep it to three to five per stage.

- ✅ "Explain to the person that you cannot keep the disclosure secret, and why"
- ❌ "Understand confidentiality"

### Knowledge

This is the agent's entire world for the stage. The ground rules tell it to teach only from here.

- Short, titled chunks (one idea each, roughly 50–200 words). Each chunk becomes a section the
  model can quote.
- Use your organisation's own words and policy. If your policy says "Designated Safeguarding Lead",
  write that and not a synonym.
- Include the _why_, not just the _what_: it lets the Teacher answer follow-up questions.
- Anything not in the knowledge, the agent should say it doesn't cover. If learners keep asking
  something, add a chunk.

### Teacher brief

Tell it **how** to teach, not what to say word for word.

```text
Teach conversationally, one objective at a time. After each objective, ask one short
check-question and wait for the answer. If the answer is wrong, re-explain using a different
example from the knowledge. When all objectives are covered and the learner answers the
check-questions correctly, finish this part.
```

### Practice brief (the role-play)

Give the persona a name, age, setting, what they want, and **how they behave if the learner does well
or badly**. Then say how to give feedback.

```text
Play Mrs Ellis, 82, receiving home care. You hint that your nephew takes money from your
purse, and you ask the learner to keep it secret. If they promise secrecy, accept it warmly.
If they explain they must share it, be briefly upset, then relieved. After 3–5 exchanges,
step out of character and give two strengths and one thing to improve. Then finish this part.
Practice is never graded.
```

### Examiner brief

A different but equivalent situation (so the learner can't just repeat the practice), and strict
neutrality.

```text
Play Mr Okafor, 70, who says a family member shouts at him and once pushed him. Stay in
character. Do not hint, coach or react to quality. Whenever the learner does something that
matches a criterion, record evidence with their words. After 4–6 exchanges, or when the
learner has clearly finished, end the role-play and finish this part.
```

### Criteria: the most important thing you write

A good criterion is **one observable behaviour** that someone could quote from a transcript.

| ✅ Good                                                                | ❌ Avoid                              |
| ---------------------------------------------------------------------- | ------------------------------------- |
| "States they will report to a manager or Designated Safeguarding Lead" | "Handles the situation appropriately" |
| "Does not promise to keep the disclosure secret"                       | "Shows empathy and follows procedure" |
| "Asks no leading questions about what happened"                        | "Communicates well" (not observable)  |

Fields:

- `key`: stable, readable id, e.g. `reports-to-lead`. **Never rename it** once attempts exist; it
  links evidence to the criterion.
- `required`: if true, failing it fails the stage. Use false for "nice to have" behaviours you
  want to track but not gate on.
- `minConfidence`: how sure the model must be (0–1) for evidence to count. 0.7 is a sensible start.
  Raise it for criteria the model tends to over-credit.

## 4. Course packs (proposed)

Today the only course is hard-coded in `apps/api/prisma/seed.ts`. That is fine for one sample, but
it is TypeScript, so experts can't edit it, and adding courses means editing code. The proposal: **a
course is a folder of plain files**, validated and imported by one command.

### Layout

```text
courses/
└── safeguarding-disclosure/
    ├── course.yaml              scenario + stages + briefs + criteria
    └── knowledge/
        ├── 01-what-is-a-disclosure.md
        ├── 02-how-to-respond.md
        └── 03-reporting-and-recording.md
```

### `course.yaml`

```yaml
slug: safeguarding-disclosure        # stable id; re-importing updates this course
title: Safeguarding adults: responding to a disclosure
status: draft                        # draft | reviewed (only reviewed courses shown to learners)
reviewedBy: null                     # name of the expert who approved it

stages:
  - position: 1
    title: Responding when someone tells you about abuse
    objectives:
      - Recognise when what someone tells you is a safeguarding concern
      - Respond calmly and listen without asking leading questions
      - Explain that you cannot keep it secret, and why
      - Report to your manager or Designated Safeguarding Lead and record the facts
    knowledge:                       # files from knowledge/, in teaching order
      - 01-what-is-a-disclosure.md
      - 02-how-to-respond.md
      - 03-reporting-and-recording.md
    teacher: |
      Teach conversationally, one objective at a time. After each objective, ask one
      short check-question…
    practice: |
      Play Mrs Ellis, 82, receiving home care…
    examiner: |
      Play Mr Okafor, 70…
    criteria:
      - key: recognises-safeguarding-concern
        description: Recognises the disclosure as a possible safeguarding concern.
        required: true
        minConfidence: 0.7
      - key: no-promise-of-secrecy
        description: Does not promise secrecy and explains why it must be shared.
        required: true
        minConfidence: 0.75
      - key: reports-to-lead
        description: States they will report to a manager or Designated Safeguarding Lead.
        required: true
        minConfidence: 0.7
      - key: no-leading-questions
        description: Asks no leading questions about what happened.
        required: false
        minConfidence: 0.7
```

### Commands

| Command                                                | What it does                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `pnpm course:validate courses/safeguarding-disclosure` | Checks the pack against a zod schema; reports every problem with its line                           |
| `pnpm course:import courses/safeguarding-disclosure`   | Validates, then upserts the scenario, stages, knowledge and criteria by `slug` / `position` / `key` |
| `pnpm course:list`                                     | Lists imported courses, their status and stage counts                                               |

Import rules:

- Matching is by `slug`, stage `position` and criterion `key`, so re-importing **updates** content
  instead of duplicating it.
- Removing a criterion that already has evidence is refused, so assessment history is never orphaned.
- The schema lives in `packages/types` (or a new `packages/course-schema`), so a future authoring UI
  and the importer validate the same way.

### One gap to close at the same time: versioning

Today, editing a stage changes it for **everyone, including past attempts**. For a demo that's fine.
Before real learners, an attempt should record the **course version it ran against** (a
`contentVersion` stamped on import and copied onto each `StageAttempt`). Then results stay explainable
after the course is edited.

## 5. The authoring loop: how you actually make it good

You won't get the briefs right first time. The platform is built for a fast loop:

```text
 edit course.yaml / knowledge
          │
          ▼
 pnpm course:import ──► talk to it at /session ──► read what happened
          ▲                                         │
          └──────────── adjust the text ◄───────────┘
```

**Where to read what happened.** Every session is fully recorded:

- `AgentEvent` rows: every transcript line, tool call and transition, in order.
- `Evidence` rows: what the Examiner credited, against which criterion, and with what confidence.
- `CriterionResult` rows: the backend's verdict for each criterion.

`pnpm db:studio` lets you browse them. Typical fixes:

| You see…                                       | Change…                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Teacher invents facts                          | Add the missing knowledge chunk; tighten the Teacher brief  |
| Teacher never finishes                         | Make the "when to finish" condition explicit and checkable  |
| Practice persona breaks character              | Add "stay in character until…" plus the exit condition      |
| Examiner credits evidence too easily           | Raise that criterion's `minConfidence`; sharpen its wording |
| Examiner misses a behaviour the learner showed | Reword the criterion in the words learners actually use     |
| Examiner hints or coaches                      | Strengthen the neutrality line in the Examiner brief        |

**Test without talking (and without cost).** For each stage, write two or three scripted
conversations, one that should pass and one that should fail, like the ones in
`apps/voice-agent/src/mock/scenarios.ts`. `pnpm simulate` checks the _rules_ (transitions, grading
thresholds) end to end. The next step after that is an evaluation harness that replays these
conversations through the real model as text and checks which evidence it records. That's how you'll
know an edit didn't make the Examiner worse.

## 6. Recommended path to a demo

1. **Pick one scenario with two or three stages.** Depth beats breadth. The safeguarding disclosure
   scenario is a good choice: it's emotionally real, clearly assessable and short.
2. **Get the source material from an expert** (your organisation's safeguarding policy and training
   notes) and have them **write or approve the criteria**. This is the credibility of the demo.
3. **Build the course-pack importer** (section 4). It's a small, contained piece of work: schema,
   import command, upsert logic and tests.
4. **Write the pack**, then run the authoring loop (section 5) until a full session feels natural
   and both your pass and fail scripts grade correctly.
5. **Mark the pack `reviewed`** once the expert has signed off, and only show reviewed courses on
   the demo machine.
6. **Run the demo on LiveKit Cloud** (`docs/livekit-cloud.md`), ideally on a machine with more
   headroom than the development laptop.

## 7. Later (not needed for the demo)

- **pgvector retrieval.** When a course's knowledge outgrows one prompt (whole policy documents),
  `KnowledgeService` embeds the chunks and selects only the relevant ones per stage or per question.
  Authors keep writing the same files; only the selection changes.
- **Authoring UI.** A web editor over the same schema, with expert review and sign-off.
- **Per-stage voice and language** settings, and accessibility options (slower speech, captions).
