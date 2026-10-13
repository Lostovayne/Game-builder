// The frame's error reporter: keeps the first error the game throws
// and answers the app's polls with it.
//
// Plain script, not a module, and loaded before the game's main
// module. A module that fails to parse — a syntax error in main.js —
// never runs, so nothing inside it could report the failure; this
// script has already executed by then, and its listeners catch the
// error event the failing script element fires. Every page loads it
// first:
//
//   <script src="./report.js"></script>
//   <script type="module" src="./main.js"></script>
//
// Protocol with the embedding page:
//   poll   — the parent posts { type: "game-ping" } to this frame
//   answer — this frame posts { type: "game-status", error } back,
//            where error is the first error it caught, or null when
//            the game is healthy.

(function () {
  "use strict";

  var firstError = null;

  // First error only: everything after it is usually a cascade.
  function record(error) {
    if (firstError === null) firstError = error;
  }

  // Runtime errors arrive as ErrorEvents dispatched on window.
  function describeEvent(event) {
    var error = { message: event.message || "Unknown error" };
    if (event.filename) error.filename = event.filename;
    if (event.lineno) error.lineno = event.lineno;
    if (event.colno) error.colno = event.colno;
    if (event.error && event.error.stack) error.stack = event.error.stack;
    return error;
  }

  // Load and parse failures arrive as error events on the element
  // itself (a script with a syntax error, a file that 404s) and
  // carry no message of their own — the file is the whole story.
  function describeElement(event) {
    var target = event.target;
    if (!target || !target.tagName) return null;
    var error = {
      message: target.tagName.toLowerCase() + " failed to load",
    };
    if (target.src) error.filename = target.src;
    if (target.href) error.filename = target.href;
    return error;
  }

  // Capture phase: element error events do not bubble, but they do
  // pass through window on the way down to the element.
  window.addEventListener(
    "error",
    function (event) {
      var error =
        event.target === window ? describeEvent(event) : describeElement(event);
      if (error) record(error);
    },
    true
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    record({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // The app polls this frame and reads the first error back.
  window.addEventListener("message", function (event) {
    if (!event.source || event.source === window) return;
    var data = event.data;
    if (!data || typeof data !== "object" || data.type !== "game-ping") return;
    event.source.postMessage(
      { type: "game-status", error: firstError },
      event.origin
    );
  });
})();
