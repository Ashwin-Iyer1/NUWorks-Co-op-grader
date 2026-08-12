// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

// This file will be bundled for the browser
const { NlpManager } = require("node-nlp");

class NlpProcessor {
  constructor() {
    this.manager = new NlpManager({ languages: ["en"], forceNER: true });
    this.isLoaded = false;
  }

  async loadModel(modelUrl) {
    if (this.isLoaded) return;

    // In browser, we might load the model from a URL or import it as JSON
    // For simplicity with Parcel, we can try importing the JSON directly if it exists
    // OR fetch it.
    // Let's assume we fetch 'model.nlp' from the extension package
    try {
      const response = await fetch(
        modelUrl || chrome.runtime.getURL("model.nlp")
      );
      const modelData = await response.text();
      this.manager.import(modelData);
      this.isLoaded = true;
      console.log("NLP Model loaded successfully");
    } catch (e) {
      console.error("Failed to load NLP model", e);
    }
  }

  async process(text) {
    if (!this.isLoaded) {
      console.warn("NLP Model not loaded yet");
      return null;
    }
    return await this.manager.process("en", text);
  }
}

export default new NlpProcessor();
