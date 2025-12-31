// Inject the interceptor script into the main world
const s = document.createElement("script");
s.src = chrome.runtime.getURL("interceptor.js");
s.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(s);

// Store job data locally instead of sending immediately
let pendingJobData = null;
let gradeButton = null;

// Function to inject the grade button
function injectGradeButton() {
  if (document.getElementById("nuworks-grade-btn")) return;

  var targetSelector =
    ".display-mobile-none.display-md-none.display-sm-none.ng-star-inserted";
  var target = document.querySelector(targetSelector);

  if (target) {
    gradeButton = document.createElement("button");
    gradeButton.id = "nuworks-grade-btn";
    gradeButton.innerText = "Grade Jobs On Page";
    gradeButton.className = "nuworks-btn";
    // Add some basic styles to make it look decent
    Object.assign(gradeButton.style, {
      marginLeft: "10px",
      backgroundColor: "#d9534f", // Red color matching typical primary buttons or the extension theme
      color: "white",
      border: "none",
      borderRadius: "4px",
      padding: "5px 10px",
      cursor: "pointer",
      fontWeight: "bold",
    });

    gradeButton.onclick = function () {
      if (!pendingJobData) {
        alert(
          "No job data captured yet. Please wait for the page to load or scroll."
        );
        return;
      }

      gradeButton.innerText = "Processing...";
      gradeButton.disabled = true;

      try {
        console.log("Sending pending job data to background...");
        chrome.runtime.sendMessage(
          {
            type: "JOBS_DATA",
            payload: pendingJobData,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending message:", chrome.runtime.lastError);
              gradeButton.innerText = "Error (Retry)";
              gradeButton.disabled = false;
            } else {
              console.log("Message sent to background script");
              gradeButton.innerText = "Grading Complete";
              setTimeout(() => {
                gradeButton.innerText = "Grade Jobs On Page";
                gradeButton.disabled = false;
              }, 5000);
            }
          }
        );
      } catch (error) {
        console.error("Content script error:", error);
        gradeButton.innerText = "Error";
      }
    };

    target.parentNode.insertBefore(gradeButton, target.nextSibling);
    console.log("NUWorks: Grade button injected");
  } else {
    // Retry if target not found yet (dynamic loading)
    setTimeout(injectGradeButton, 1000);
  }
}

// Start trying to inject the button
injectGradeButton();

// Listen for messages from the interceptor
window.addEventListener("message", function (event) {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data.type && event.data.type === "NUWORKS_JOB_DISCOVERY") {
    console.log(
      "Content script received job discovery data (captured)",
      event.data.data
    );
    pendingJobData = event.data.data;

    // updates the button text if it exists to show data is ready
    if (gradeButton) {
      gradeButton.innerText = "Grade Jobs On Page";
      gradeButton.style.backgroundColor = "#5cb85c"; // Green to indicate ready
    }
  }
});
