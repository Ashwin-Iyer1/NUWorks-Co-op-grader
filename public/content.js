// Inject the interceptor script into the main world
const s = document.createElement("script");
s.src = chrome.runtime.getURL("interceptor.js");
s.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(s);

// Listen for messages from the interceptor
window.addEventListener("message", function (event) {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data.type && event.data.type === "NUWORKS_JOB_DISCOVERY") {
    console.log("Content script received job discovery data", event.data.data);
    chrome.runtime.sendMessage(
      {
        type: "JOBS_DATA",
        payload: event.data.data,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Content script error sending message:",
            chrome.runtime.lastError
          );
        } else {
          console.log("Message sent to background script");
        }
      }
    );
  }
});
