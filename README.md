# BackOnTrack

BackOnTrack is a browser-local, rule-based simulation of an Alexa+ style travel recovery experience. A fictional Amsterdam-to-Utrecht cancellation prompts a plan across mock transit, calendar and household tools. Change the budget or arrival window, inspect the revised plan, then confirm simulated coordination.

Created as a new prototype starting October 10, 2026. Codex assisted development of the code, tests and documentation. The application runs deterministic JavaScript; it does not run an AI model or connect to Alexa, AWS, live transport, a real calendar or messaging services.

## Run locally

Requirements: a modern browser and a local static HTTP server. Node.js is needed only for the tests. There are no package dependencies, API keys or paid services.

From this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/` in your browser. A comparable static server also works. Use HTTP serving instead of opening `index.html` directly, because the app imports JavaScript modules.

Run the engine tests:

```sh
node --test engine.test.mjs
```

Or use `npm test` if npm is available. No `npm install` is required.

## Demonstrated journey

1. Start the cancellation scenario. With a €20 budget and 50-minute arrival window, the express bus is selected at €14 and 35 minutes. A €9, 45-minute replacement train is also feasible.
2. Set the budget to €10. The plan automatically switches to the replacement train and requires fresh confirmation.
3. Confirm. Three mock coordination results are recorded; no ticket is bought, calendar changed or message sent.
4. Reset and shorten the window to 30 minutes while retaining a €20 budget. No route fits; confirmation is disabled. A fictional taxi takes 25 minutes but costs €64.
5. Export the simulated evidence as JSON.

All transport times, prices, places and household context are fictional fixtures. They are not travel advice or live availability.

## State and trace

`engine.js` provides immutable planning transitions, integer-cent budgets and explicit infeasibility reasons. `app.js` renders the experience and stores state in browser localStorage. Restoring a session validates the current constraints and routes and reconstructs the derived plan and trace. It does not restore an independently verified history of earlier actions.

The export is a local snapshot of simulated state, not a tamper-proof audit log. Each engine trace entry is marked simulated and `externalActionsPerformed` remains false. Clear browser storage or use Reset to discard the current scenario. Browser storage is not an appropriate place for personal or financial information.

## Files

- `index.html`, `style.css`, `app.js`: interface, session persistence and JSON export.
- `engine.js`, `engine.test.mjs`: planning model and tests.
- `SUBMISSION-DRAFT.txt`: factual draft description and product feedback.
- `DEMO-PLAN.txt`: proposed demonstration and the central submission readiness record.
- `TEST-EVIDENCE.txt`: verified checks and their limits.

Source repository: https://github.com/BizzKittai/backontrack. The public YouTube/Vimeo video is still pending. The 60-second local MP4 is an edited sequence of actual browser screenshots; it is not a continuous live recording. Any owner-only hosted preview is separate from the contest's source/video deliverables. See `DEMO-PLAN.txt` for the current readiness status and official reference.

The alternate simulation route is stated in the contest rules. Individual admission of this deterministic prototype remains the organizers' decision. The authorized user completed hackathon registration on October 11, 2026, and the BackOnTrack project draft was saved. The public demo video and final eligibility declarations remain pending. No final submission or prize has been confirmed.

## License

MIT, copyright 2026 BizzKitt BV. See `LICENSE`. No Amazon affiliation or endorsement is implied.
