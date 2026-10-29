"use strict";

// Find the page elements once so each event handler can reuse them.
const form = document.querySelector("#planner-form");
const imageFileInput = document.querySelector("#image-file");
const alternativeTextInput = document.querySelector("#alt-text");
const originalWidthOutput = document.querySelector("#original-width");
const generateButton = form.querySelector('button[type="submit"]');
const message = document.querySelector("#message");
const preview = document.querySelector("#preview");
const results = document.querySelector("#results");

// These variables remember the image that the student selected.
let selectedImageFile = null;
let selectedImage = null;
let selectedImageObjectURL = "";

// If another file is chosen while one is loading, ignore the older result.
let imageSelectionVersion = 0;

function readNumberField(fieldId) {
  const field = document.querySelector(`#${fieldId}`);
  return Number(field.value);
}

// Make a sorted list of image widths between the smallest and largest useful sizes.
function generateWidths(originalWidth, maximumDisplayWidth, devicePixelRatio, candidateCount) {
  const largestCandidateWidth = Math.min(
    originalWidth,
    maximumDisplayWidth * devicePixelRatio
  );
  const smallestCandidateWidth = Math.min(
    originalWidth,
    Math.max(1, Math.ceil(maximumDisplayWidth / 2))
  );

  // A Set keeps the list free of duplicates when the original image is small.
  const uniqueWidths = new Set();

  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex++) {
    const position = candidateIndex / (candidateCount - 1);
    const width = Math.round(
      smallestCandidateWidth +
      (largestCandidateWidth - smallestCandidateWidth) * position
    );
    uniqueWidths.add(width);
  }

  return [...uniqueWidths].sort((firstWidth, secondWidth) => firstWidth - secondWidth);
}

// Build one of the small summary cards shown above the generated code.
function createMetricCard(label, value) {
  const metricCard = document.createElement("div");
  metricCard.className = "metric";

  const metricValue = document.createElement("strong");
  metricValue.textContent = value;

  const metricLabel = document.createElement("span");
  metricLabel.textContent = label;

  metricCard.append(metricValue, metricLabel);
  return metricCard;
}

// Load a local image so the browser can tell us its real pixel dimensions.
function loadImage(imageSource) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => {
      if (image.naturalWidth > 0) {
        resolve(image);
      } else {
        reject(new Error("The selected file has no readable image width."));
      }
    }, { once: true });

    image.addEventListener("error", () => {
      reject(new Error("The selected file could not be opened as an image."));
    }, { once: true });

    image.src = imageSource;
  });
}

// Escape special characters so alt text stays safe inside the generated HTML.
function escapeHTMLAttribute(value) {
  const htmlEntities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  };

  return value.replace(/[&<>"']/g, character => htmlEntities[character]);
}

// Create the filename students can give each resized image.
function createCandidateFilename(originalFilename, width) {
  const extensionPosition = originalFilename.lastIndexOf(".");
  const filenameHasExtension = extensionPosition > 0;
  const filenameWithoutExtension = filenameHasExtension
    ? originalFilename.slice(0, extensionPosition)
    : originalFilename;
  const fileExtension = filenameHasExtension
    ? originalFilename.slice(extensionPosition)
    : "";

  return `${encodeURIComponent(filenameWithoutExtension)}-${width}w` +
    encodeURIComponent(fileExtension);
}

// Show a preview and read the dimensions when a file is selected.
imageFileInput.addEventListener("change", async () => {
  const currentSelectionVersion = ++imageSelectionVersion;
  const chosenFile = imageFileInput.files[0];

  // Release the previous temporary URL so the browser can free its memory.
  if (selectedImageObjectURL) {
    URL.revokeObjectURL(selectedImageObjectURL);
  }

  selectedImageFile = null;
  selectedImage = null;
  selectedImageObjectURL = "";
  originalWidthOutput.textContent = chosenFile
    ? "Reading image dimensions…"
    : "Choose an image file";
  results.hidden = true;
  message.textContent = "";
  preview.replaceChildren();
  generateButton.disabled = true;

  if (!chosenFile) {
    const previewMessage = document.createElement("p");
    previewMessage.textContent = "Choose an image file to preview it here.";
    preview.append(previewMessage);
    return;
  }

  // An object URL lets the browser read the file without uploading it.
  const imageObjectURL = URL.createObjectURL(chosenFile);
  selectedImageObjectURL = imageObjectURL;

  try {
    const loadedImage = await loadImage(imageObjectURL);

    // A newer file may have been selected while this image was loading.
    if (currentSelectionVersion !== imageSelectionVersion) {
      URL.revokeObjectURL(imageObjectURL);
      return;
    }

    selectedImageFile = chosenFile;
    selectedImage = loadedImage;
    originalWidthOutput.textContent = `${loadedImage.naturalWidth} px`;
    loadedImage.alt = alternativeTextInput.value.trim();
    preview.replaceChildren(loadedImage);
    generateButton.disabled = false;
  } catch {
    URL.revokeObjectURL(imageObjectURL);
    if (currentSelectionVersion !== imageSelectionVersion) return;

    selectedImageObjectURL = "";
    originalWidthOutput.textContent = "Unavailable";
    imageFileInput.value = "";

    const errorMessage = document.createElement("p");
    errorMessage.className = "preview-error";
    errorMessage.textContent =
      "This file could not be opened as an image. Choose a valid image file and try again.";
    preview.replaceChildren(errorMessage);
    message.textContent = "Image dimensions could not be read.";
  }
});

// Keep the preview's alternative text in sync while it is being edited.
alternativeTextInput.addEventListener("input", () => {
  if (selectedImage) {
    selectedImage.alt = alternativeTextInput.value.trim();
  }
});

// Calculate the responsive settings and show the generated code when the form is submitted.
form.addEventListener("submit", event => {
  event.preventDefault();
  message.textContent = "";

  if (!selectedImageFile || !selectedImage) {
    message.textContent = "Choose a valid image file before generating a configuration.";
    return;
  }

  const originalWidth = selectedImage.naturalWidth;
  const maximumDisplayWidth = readNumberField("display-width");
  const devicePixelRatio = readNumberField("device-pixel-ratio");
  const candidateCount = readNumberField("candidate-count");

  // Check the values here as well as in the form so invalid values cannot be used.
  const settingsAreValid = [
    originalWidth,
    maximumDisplayWidth,
    devicePixelRatio,
    candidateCount
  ].every(Number.isInteger) &&
    originalWidth > 0 &&
    maximumDisplayWidth > 0 &&
    maximumDisplayWidth <= 100000 &&
    [1, 2, 3].includes(devicePixelRatio) &&
    [4, 6, 8].includes(candidateCount);

  if (!settingsAreValid) {
    message.textContent =
      "Enter a whole-number display width between 1 and 100,000 pixels.";
    results.hidden = true;
    return;
  }

  const recommendedWidths = generateWidths(
    originalWidth,
    maximumDisplayWidth,
    devicePixelRatio,
    candidateCount
  );
  const targetPixelWidth = Math.min(
    originalWidth,
    maximumDisplayWidth * devicePixelRatio
  );
  const alternativeText = alternativeTextInput.value.trim();
  const originalFilename = selectedImageFile.name;

  // The "w" after each number tells the browser the width of that image file.
  const srcset = recommendedWidths
    .map(width => `${createCandidateFilename(originalFilename, width)} ${width}w`)
    .join(",\n");

  // "sizes" describes the displayed width so the browser can choose a srcset image.
  const sizes =
    `(max-width: ${maximumDisplayWidth}px) 100vw, ${maximumDisplayWidth}px`;
  const largestWidth = recommendedWidths[recommendedWidths.length - 1];
  const largestImageFilename = createCandidateFilename(originalFilename, largestWidth);
  const generatedHTML = `<img\n  src="${largestImageFilename}"\n` +
    `  srcset="${srcset.replace(/\n/g, "\n          ")}"\n` +
    `  sizes="${sizes}"\n  alt="${escapeHTMLAttribute(alternativeText)}"\n` +
    "  loading=\"lazy\"\n>";

  document.querySelector("#srcset-output").textContent = srcset;
  document.querySelector("#html-output").textContent = generatedHTML;

  // Update the summary cards with the values used to build the markup.
  document.querySelector("#metrics").replaceChildren(
    createMetricCard("Candidate widths", recommendedWidths.length),
    createMetricCard("Largest candidate", `${largestWidth} px`),
    createMetricCard("Target pixel width", `${targetPixelWidth} px`)
  );

  // Show every recommended width as a small label.
  const widthList = document.querySelector("#width-list");
  widthList.replaceChildren();

  recommendedWidths.forEach(width => {
    const widthBadge = document.createElement("span");
    widthBadge.className = "width-chip";
    widthBadge.textContent = `${width}w`;
    widthList.append(widthBadge);
  });

  results.hidden = false;
  message.textContent = "Image configuration generated.";

  // Move to the new results so the user can see what the button created.
  const resultsHeading = document.querySelector("#results-heading");
  resultsHeading.focus({ preventScroll: true });
  resultsHeading.scrollIntoView({ behavior: "instant", block: "start" });
});

// Copy either output block to the clipboard.
document.querySelectorAll("[data-copy]").forEach(copyButton => {
  copyButton.addEventListener("click", async () => {
    const outputElement = document.getElementById(copyButton.dataset.copy);

    try {
      await navigator.clipboard.writeText(outputElement.textContent);
      copyButton.textContent = "Copied!";

      setTimeout(() => {
        copyButton.textContent = copyButton.dataset.copy === "html-output"
          ? "Copy HTML"
          : "Copy srcset";
      }, 1200);
    } catch {
      message.textContent =
        "Clipboard access was unavailable. Select and copy the output manually.";
    }
  });
});
