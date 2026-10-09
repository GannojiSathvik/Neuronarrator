# NeuroNarrator — Hashira presentation preparation

Prepared for Monday, 12 October 2026, from the supplied job description, hackathon transcript, and this repository.

## Is this a good project for the role?

Yes, if you present one reliable journey and explain its engineering decisions yourself. This project demonstrates React, TypeScript, asynchronous programming, browser APIs, database modeling, retrieval algorithms, and AI integration. The job description says MERN is an advantage, not a requirement. The current implementation is **React + TypeScript + IndexedDB/Dexie + Supabase/Deno edge functions**. It does not use Express or MongoDB. Node runs the development tooling, not an Express application server.

A project alone does not establish an ₹18 LPA offer. Your ability to reason about code, solve DSA problems, discuss limitations, and communicate your contribution matters. Do not claim you trained a model, built a production medical product, or implemented technologies that are only in the inspiration video.

The supplied schedule identifies **12 October as the open house** and the hackathon as **after Dussehra**. Verify the presentation slot and duration with the organizer; do not assume the open house is itself a scored technical round.

## What the transcript contributes

| Transcript segment | Useful idea | Decision for NeuroNarrator |
| --- | --- | --- |
| 0:35–1:03 | Recognize someone and bring back recent context | Connect existing local face profiles to saved conversation notes |
| 1:08–2:18 | Small contextual overlays near the camera | Show a concise reminder and source in the existing face overlay |
| 2:32–3:23 | Streaming, transcription, identity, and context retrieval | Keep modules separate; review dictation before saving |
| 4:53–8:39 | Late integration, mocked components, missing files, uncertain demo | Add a clearly labeled sample story that does not depend on live AI |
| 7:26–7:44 | Difficulty knowing who said what | Explicitly avoid claiming speaker diarization; the user chooses the person |
| 9:14–9:25 | MongoDB and embedding-based recall | Start with explainable local BM25 retrieval; vector search is future work |
| 9:45–10:23 | First place and the role of presentation | Build a clear problem → demo → engineering → limitations story; the transcript does not prove clinical efficacy or technical reliability |

The useful product idea is a **person-specific memory companion**. Do not copy the dementia positioning as a proven medical claim. Introduce it as an assistive prototype for remembering familiar people and conversations. Clinical validation and real accessibility research have not been performed.

## What is implemented now

- A responsive memory workspace at `/`; the existing vision experience is at `/vision`.
- People with stable IDs and relationships; existing face records remain available after the database upgrade.
- Create, read, edit, search, and delete dated conversation notes.
- Person-scoped lexical retrieval using BM25. Empty searches show recent notes; unmatched topics show an explicit empty state.
- Reminders extracted from saved text, with a link to the original note and its date.
- Optional browser dictation, explicit consent, interim text, a one-minute limit, and review before saving. No speaker diarization or automatic background conversation recording.
- Read-aloud using browser speech synthesis.
- A fictional sample story with three people and five notes. Sample profiles have no face descriptors. Repeated loading does not duplicate the sample.
- JSON export excluding face descriptors. Export is portable data, not an implemented restore/sync feature.
- Face enrollment can attach to an existing person. Recognized faces display recent local conversation notes.
- Individual person deletion removes their associated notes in one transaction. “Forget faces” removes biometric enrollment while retaining profiles and conversations.
- A camera entry notice and explicit start. Returning to the page does not start the camera automatically.
- AI response validation and a bounded vision request, so malformed output is not treated as a valid scene result.

## Three-minute demo

**0:00–0:25 — Problem**

“Recognizing a familiar face is only half the problem. We may remember a person’s name but lose the context of our last conversation. NeuroNarrator connects people to the moments we want to remember.”

**0:25–1:00 — Show a grounded reminder**

Open the memory space and click **Try sample story**. Say, “These are clearly labeled fictional sample records.” Select Arjun. Read the short reminder and click its source link to show the original dated note.

**1:00–1:35 — Demonstrate retrieval and a boundary**

Search for `coffee`, then `book`. Explain that search ranks saved notes rather than generating facts. Select Meera and search `coffee`: the app should return no result rather than borrow Arjun’s conversation.

**1:35–2:05 — Prove persistence**

Add a short note such as “We agreed to rehearse on Sunday.” Give it a title, save it, and reload. Show that the note is still present. Dictation is optional; do not let microphone setup interrupt the main demo.

**2:05–2:35 — Explain the architecture**

“React owns the interface. Dexie stores people and their notes in IndexedDB. A shared person ID connects face enrollment to conversation history. Local retrieval ranks that person’s notes, and the reminder is an excerpt with its source. Live scene descriptions use a separate Supabase edge function that calls a vision model.”

**2:35–3:00 — Tradeoffs and next step**

“I chose a local memory layer to reduce network dependence and avoid sending private notes to a model. The tradeoff is no cross-device sync and keyword matching rather than semantic recall. Next, I would evaluate retrieval on a labeled dataset and build authenticated sync with per-user authorization.”

If asked for live AI, show `/vision` only after rehearsal on the same browser and device. With a consenting participant: add a real profile, open live vision from that profile, start the camera, choose Add for the unknown face, confirm enrollment, then save a note in the memory space and return to scanning. Never present the sample story as proof of live facial recognition.

## Architecture you should be able to draw

```text
Memory route                          Live vision route
React workspace                       Camera frame
    │                                      │
    ├─ note editor / reviewed dictation     ├─ local face model → possible person ID
    │                                      │                         │
    ▼                                      │                         ▼
Dexie / IndexedDB ◄─────────────────────────┘                  local recent notes
    faces: id, name, relation, optional descriptor                  + source
    memories: id, personId, title, body, occurredAt, source
    │
    ├─ filter by person → BM25 ranking → original-text reminder
    └─ atomic person + note deletion

Camera frame → Supabase analyze-image → vision provider → validated response
                                                        → captions / speech
```

The memory path does not use a remote backend. The existing scene-analysis path does. Do not describe this as cloud-synced memory or an end-to-end MERN implementation.

## Questions to rehearse

**Where is the AI?**

Face detection and recognition use pretrained `face-api.js` networks in the browser. Scene interpretation comes from a remote multimodal model. Dictation uses the browser’s speech recognition service. The new note retrieval is BM25, a classical information-retrieval algorithm, not a trained language model. Reminders are extractive.

**Why BM25 instead of embeddings?**

It is inexpensive, deterministic, easy to explain, and adequate for a small personal collection. IDF weights rarer terms; term-frequency saturation prevents repeated words from dominating; length normalization limits long-note bias. Limitations include synonyms, paraphrases, stemming, and semantic understanding. Evaluate those shortcomings before adding embedding complexity. This is retrieval, not a generative RAG pipeline.

**What is the complexity?**

Let M be all loaded notes, N the selected person’s notes, T their total tokens, and Q the distinct query tokens. This implementation filters in O(M), tokenizes in O(T), computes document frequencies with repeated scans in O(QT), builds term maps in O(T), scores in O(NQ), and sorts in O(N log N). Space is O(T + N). A production system would query only the person’s notes, cache an inverted index, and use top-k selection where appropriate. The current browser hook loads the full library; it is designed for a small personal dataset.

**How do you stop it inventing a conversation?**

There is no generative step in memory recall. It filters by person before ranking, returns original note text with provenance, and returns no match when nothing matches. That prevents generated personal facts, but it does not guarantee that a user-written note is correct. A face match can also select the wrong person, so the UI asks the user to confirm identity.

**Is a face distance of 0.3 equivalent to 70% confidence?**

No. Euclidean distance between descriptors is not a calibrated probability. A threshold classifies a possible match; choosing the threshold requires evaluation across lighting, pose, and participants. The previous percentage display was removed. Recognition no longer blends its own predictions into enrollment descriptors, which could propagate a false match.

**How do you avoid orphaned notes?**

All memory writes check that the parent person exists inside the same database transaction. Deleting a person deletes their notes and profile atomically. Editing verifies note ownership. The database upgrade retains the old person IDs so existing face records stay connected.

**Why not put every note in React state or localStorage?**

React state is transient UI state. IndexedDB persists structured records, supports indexes and transactions, and handles typed face descriptors. A live query updates the UI after database changes. localStorage would require serializing and rewriting a large shared object without transactional relationships.

**How do async failures work?**

Dictation detaches callbacks on cancel, bounds recording time, and keeps finalized words after Stop. The vision loop uses cycle IDs to ignore outdated results. A request timeout bounds waiting, and response validation rejects malformed model output. Tests use fake browser speech sessions and an isolated IndexedDB implementation.

**Is the data private and offline?**

Saved notes and descriptors remain in this browser; they are not encrypted by this app or synced to another device. Clearing browser storage removes them. Camera frames go to the configured vision service. Browser dictation and speech synthesis may use browser/provider services. The sample memory journey needs no AI request after the app loads, but there is no service-worker installation or guaranteed cold-start offline app support.

**How would you build a MERN version?**

Keep the React screens behind a repository interface. Add Express routes for people and conversations, authenticated ownership checks, schema validation, and request limits. Store records in MongoDB with compound indexes on owner/person/time. Use a deletion transaction or a carefully designed cascade, then add synchronization and conflict handling. Store biometric data separately only if there is a justified requirement. This is a proposed extension, not something already implemented.

**What did you contribute?**

Describe only work you understand and actually did. Separate the original project, AI-assisted implementation, and your own decisions. Be prepared to implement a note filter, explain a transaction, trace a face match, and debug a failing request without reading a memorized answer. Do not claim the inspiration video’s prize, fine-tuning, or team work as your own.

## Presentation readiness and remaining limitations

- Run from the repository root, not the older `contribution/` copy: `npm install`, `npm run dev`, then open `http://127.0.0.1:8080`.
- Keep the same browser/origin for rehearsal and presentation; each origin has a separate local library.
- Rehearse the sample path first. Keep a screen recording or screenshots as a presentation backup, clearly labeled if the live service is unavailable.
- Run `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` before the presentation.
- Root lint checks the active app and excludes the independently packaged `contribution/` copy. That older copy has existing lint errors and has not been modified. Generated UI components retain their existing fast-refresh warnings.
- Live camera matching, microphone transcription, and paid provider availability need a real-device rehearsal. Automated tests do not establish recognition accuracy or clinical safety.
- Only the `analyze-image` edge-function source exists in this checkout. The older README mentions TTS/STT functions whose source is absent. Do not claim this checkout can independently redeploy those functions. Scene speech has a browser fallback; the new memory dictation/read-aloud use browser APIs.
- The existing edge-function configuration disables JWT verification and has permissive CORS. Authentication, ownership enforcement, abuse limits, observability, provider cost controls, and dependency remediation are required before exposing a production service.
- The dependency installation reported security advisories in the inherited dependency tree. No breaking blanket upgrade was applied immediately before the demo; this still needs a separate remediation pass.
- Current face matching chooses one face per detection cycle; it does not track several people or identify speakers. Face models download from a third-party host on demand. Live scene AI is not a dependable navigation or hazard-warning system.
- JSON export is implemented; import, encrypted backup, cloud sync, semantic embeddings, and streaming diarization are not.

Technical references checked: [MDN: browser speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API), [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()).
