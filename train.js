const { NlpManager } = require("node-nlp");

async function train() {
  const manager = new NlpManager({ languages: ["en"], forceNER: true });

  // --- 1. Graduation Year Intents ---
  manager.addDocument(
    "en",
    "Must be graduating in %year%",
    "requirement.grad_year"
  );
  manager.addDocument("en", "Class of %year%", "requirement.grad_year");
  manager.addDocument("en", "Graduates of %year%", "requirement.grad_year");
  manager.addDocument(
    "en",
    "Expected graduation date: %year%",
    "requirement.grad_year"
  );
  manager.addDocument(
    "en",
    "Students graduating in %year% or %year%",
    "requirement.grad_year"
  );

  // --- 2. School Year Intents ---
  manager.addDocument(
    "en",
    "Open to %school_year% students",
    "requirement.school_year"
  );
  manager.addDocument(
    "en",
    "Specifically for %school_year%",
    "requirement.school_year"
  );
  manager.addDocument(
    "en",
    "Must be a %school_year%",
    "requirement.school_year"
  );
  manager.addDocument(
    "en",
    "Only %school_year% and %school_year%",
    "requirement.school_year"
  );
  manager.addDocument(
    "en",
    "%school_year% standing required",
    "requirement.school_year"
  );
  manager.addDocument(
    "en",
    "Enrolled in an %school_year% or graduate program",
    "requirement.school_year"
  );
  manager.addDocument(
    "en",
    "Enrolled in an %school_year% program",
    "requirement.school_year"
  );

  // --- 3. Named Entities ---
  // Custom entity for School Year
  const schoolYears = [
    "freshman",
    "sophomore",
    "junior",
    "senior",
    "graduate",
    "master",
    "phd",
    "mba",
    "undergraduate",
  ];

  // We can use regex or list for entities
  // node-nlp has specific ways to add entities.
  // simplified: we rely on NER to pick up these words if we define them or use built-in regex?
  // Let's explicitly add named entities

  schoolYears.forEach((year) => {
    manager.addNamedEntityText("school_year", year, ["en"], [year]);
    manager.addNamedEntityText("school_year", year + "s", ["en"], [year]); // plural
  });

  // Adding "year" entity extraction (built-in usually handles numbers, but we can refine)
  // We'll rely on the 'number' entity or boolean regex for years like 2024, 2025.

  // --- Training ---
  console.log("Training NLP model...");
  await manager.train();

  console.log("Saving model to model.nlp...");
  manager.save("public/model.nlp");
  // Also save as JSON for easier browser loading if needed
  // manager.save() produces model.nlp which is text/json.
}

train();
