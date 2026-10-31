// Cold-start timings in ms (see core bootLine); data stays 0 until the database is loaded.
export const boot = { page: 0, data: 0 };

/** Names the startup step for the safety net in index.html ("JEarn is stuck …"). */
export const setStage = (s: string) => { (window as unknown as { __stage?: string }).__stage = s; };
