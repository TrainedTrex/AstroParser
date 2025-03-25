/**
 * Utility functions for the DE440 ephemeris parser
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

/**
 * Reads a file and returns its contents
 * @param {string} filePath - Path to the file
 * @param {string|null} encoding - Encoding to use (null for binary)
 * @returns {Promise<string|Buffer>} - File contents
 */
function readFile(filePath, encoding = 'utf8') {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, encoding, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Ensures a directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<void>}
 */
async function ensureDir(dirPath) {
  return new Promise((resolve, reject) => {
    fs.mkdir(dirPath, { recursive: true }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Writes data to a file
 * @param {string} filePath - Path to the file
 * @param {string|Buffer} data - Data to write
 * @returns {Promise<void>}
 */
async function writeFile(filePath, data) {
  await ensureDir(path.dirname(filePath));
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, data, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Parses a scientific notation string in D format (e.g., "0.123D+01") to a number
 * @param {string} str - String to parse
 * @returns {number} - Parsed number
 */
function parseScientificNotation(str) {
  if (!str) return NaN;
  
  // For ASCP files format, handle the D notation
  // Examples: 0.2287184500000000D+07, -0.899999999999999952D-13
  
  // First, validate the input string format
  const validSciFormat = /^[+-]?\d+\.\d+[Dd][+-]\d+$/;
  const validNumFormat = /^[+-]?\d+\.\d+$/;
  
  if (validSciFormat.test(str)) {
    // Replace 'D' or 'd' with 'E' to make JavaScript's parseFloat work with scientific notation
    const normalizedStr = str.replace(/[Dd]([+-]?\d+)/, 'E$1');
    return parseFloat(normalizedStr);
  } else if (validNumFormat.test(str)) {
    // Regular decimal number, no exponent
    return parseFloat(str);
  } else {
    // Try a more lenient approach for other formats
    const normalizedStr = str.replace(/[Dd]([+-]?\d+)/, 'E$1');
    
    // Handle cases where there's no explicit sign after D/E
    const fixedStr = normalizedStr.replace(/[Ee](\d+)/, 'E+$1');
    
    // Parse the normalized string
    const value = parseFloat(fixedStr);
    
    if (isNaN(value)) {
      console.warn(`Failed to parse scientific notation: ${str}`);
    }
    
    return value;
  }
}

/**
 * Evaluates a Chebyshev polynomial at a given normalized time
 * @param {Array<number>} coefficients - Chebyshev polynomial coefficients
 * @param {number} normalizedTime - Normalized time (-1 to 1)
 * @returns {number} - Evaluated value
 */
function evaluateChebyshev(coefficients, normalizedTime) {
  const n = coefficients.length;
  let d = 0;
  let dd = 0;
  
  // Calculate Chebyshev polynomial value using Clenshaw algorithm
  for (let i = n - 1; i >= 1; i--) {
    const temp = d;
    d = 2 * normalizedTime * d - dd + coefficients[i];
    dd = temp;
  }
  
  return normalizedTime * d - dd + coefficients[0];
}

/**
 * Normalizes a time value to the range [-1, 1] for Chebyshev evaluation
 * @param {number} time - Julian date
 * @param {number} startTime - Start of the interval
 * @param {number} endTime - End of the interval
 * @returns {number} - Normalized time in range [-1, 1]
 */
function normalizeTime(time, startTime, endTime) {
  return 2 * (time - startTime) / (endTime - startTime) - 1;
}

/**
 * Converts a Julian date to a human-readable date string
 * @param {number} julianDate - Julian date
 * @returns {string} - Human-readable date string
 */
function julianDateToString(julianDate) {
  // Julian date at Jan 1, 4713 BC 12:00 GMT
  const JULIAN_EPOCH = 2440587.5; // January 1, 1970
  const MILLIS_PER_DAY = 86400000;
  
  // Convert to JavaScript date
  const date = new Date((julianDate - JULIAN_EPOCH) * MILLIS_PER_DAY);
  
  // Format the date
  return date.toISOString();
}

/**
 * Find files matching a pattern
 * @param {string} pattern - Glob pattern to match files
 * @returns {Promise<Array<string>>} - Array of matching file paths
 */
function findFiles(pattern) {
  return new Promise((resolve, reject) => {
    glob(pattern)
      .then(files => {
        resolve(files.sort()); // Sort files to ensure consistent order
      })
      .catch(err => {
        reject(err);
      });
  });
}

/**
 * Sort files that contain dates in their names
 * This is particularly useful for DE440 files which might follow a pattern
 * like de440_YYYY-MM-DD.440 or similar
 * @param {Array<string>} files - Array of file paths
 * @returns {Array<string>} - Sorted array of file paths
 */
function sortFilesByDatePattern(files) {
  return files.sort((a, b) => {
    // Extract date parts from filenames or use the filename for sorting
    const fileA = path.basename(a);
    const fileB = path.basename(b);
    
    // Try to find a date pattern in the filename
    const datePatternA = fileA.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
    const datePatternB = fileB.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
    
    if (datePatternA && datePatternB) {
      // If both have date patterns, compare them
      const dateA = new Date(datePatternA[1], datePatternA[2] - 1, datePatternA[3]);
      const dateB = new Date(datePatternB[1], datePatternB[2] - 1, datePatternB[3]);
      return dateA - dateB;
    }
    
    // Alternative: look for Julian dates in the filenames
    const jdPatternA = fileA.match(/(\d{7}\.\d+)/);
    const jdPatternB = fileB.match(/(\d{7}\.\d+)/);
    
    if (jdPatternA && jdPatternB) {
      return parseFloat(jdPatternA[1]) - parseFloat(jdPatternB[1]);
    }
    
    // Fall back to alphabetical sort
    return fileA.localeCompare(fileB);
  });
}

/**
 * Transform coordinates from ICRF to Ecliptic J2000
 * @param {Object} position - Position object with x, y, z
 * @returns {Object} - Transformed position
 */
function transformICRFToEcliptic(position) {
    // Obliquity of the ecliptic J2000 (23.4392911 degrees in radians)
    const epsilon = 0.409092804222329; // radians

    // Transformation matrix for ICRF to Ecliptic
    const cosEps = Math.cos(epsilon);
    const sinEps = Math.sin(epsilon);

    // Get the original coordinates
    const { x, y, z } = position;

    // Apply the rotation matrix to transform from ICRF (equatorial) to ecliptic
    const xEcl = x;
    const yEcl = y * cosEps - z * sinEps;
    const zEcl = y * sinEps + z * cosEps;

    return { x: xEcl, y: yEcl, z: zEcl };
}

/**
 * Transform coordinates from Ecliptic J2000 to ICRF
 * @param {Object} position - Position object with x, y, z
 * @returns {Object} - Transformed position
 */
function transformEclipticToICRF(position) {
    // Obliquity of the ecliptic J2000 (23.4392911 degrees in radians)
    const epsilon = 0.409092804222329; // radians

    // Transformation matrix for Ecliptic to ICRF
    const cosEps = Math.cos(epsilon);
    const sinEps = Math.sin(epsilon);

    // Get the original coordinates
    const { x, y, z } = position;

    // Apply the inverse rotation matrix
    const xEq = x;
    const yEq = y * cosEps + z * sinEps;
    const zEq = -y * sinEps + z * cosEps;

    return { x: xEq, y: yEq, z: zEq };
}
  
  /**
   * Change the coordinate center from SSB to Sun or vice versa
   * @param {Object} position - Position object with x, y, z
   * @param {Object} sunPosition - Position of the sun with x, y, z
   * @param {string} toCenter - Target coordinate center ('SSB' or 'SUN')
   * @returns {Object} - Position with changed coordinate center
   */
function changeCoordinateCenter(position, sunPosition, toCenter) {
    const { x, y, z } = position;
    const { x: sunX, y: sunY, z: sunZ } = sunPosition;

    if (toCenter === 'SUN') {
        // SSB to Sun-centered
        return {
        x: x - sunX,
        y: y - sunY,
        z: z - sunZ
        };
    } else if (toCenter === 'SSB') {
        // Sun-centered to SSB
        return {
        x: x + sunX,
        y: y + sunY,
        z: z + sunZ
        };
    }

    // If no change or invalid center, return original
    return position;
}

module.exports = {
  readFile,
  ensureDir,
  writeFile,
  parseScientificNotation,
  evaluateChebyshev,
  normalizeTime,
  julianDateToString,
  findFiles,
  sortFilesByDatePattern,
  transformICRFToEcliptic,
  transformEclipticToICRF,
  changeCoordinateCenter
};