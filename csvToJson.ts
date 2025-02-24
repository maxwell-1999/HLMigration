const fs = require("fs");
// const { google } = require("googleapis");
const { parse } = require("json2csv");
function bigintToFloat(bigintValue: bigint, scale = 1e18) {
  // Convert scale to BigInt for consistency
  const scaleBigInt = BigInt(scale);
  // console.log(scaleBigInt)
  if (bigintValue < 0n) {
    return 0;
  }
  // Perform division to get the scaled value as a BigInt
  const integerPart = bigintValue / scaleBigInt;

  // Compute the fractional part as a float
  const fractionalPart =
    Number(bigintValue % scaleBigInt) / Number(scaleBigInt);

  // Combine integer and fractional parts
  return Number(integerPart) + fractionalPart;
}

// Your JSON data
const jsonFilePath = "./data.json"; // Replace with your JSON file path
const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, "utf-8"));

// Convert JSON data to CSV
const rows = Object.entries(jsonData).map(([key, value]) => {
  value = value.map((s) => bigintToFloat(BigInt(s)));
  return [key, ...value]; // Flattening the JSON structure
});

const csvData = parse([
  [
    "Address",
    "rawBFR",
    "rawEsBFR",
    "BLP",
    "Vestor1 Pending",
    "Vestor2 Pending",
    "Staking",
    "Camelot",
  ],
  ...rows,
]);

// Save CSV to a file
const csvFilePath = "./datacoallesced.csv";
fs.writeFileSync(csvFilePath, csvData, "utf-8");

// Function to upload CSV to Google Drive
