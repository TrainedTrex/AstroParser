import { defined } from './defined.js';
import { defaultValue } from './defaultValue.js';
import { DeveloperError } from './DeveloperError.js';
import { RuntimeError } from './RuntimeError.js';
import { JulianDate } from './JulianDate.js';
import { TimeStandard } from './TimeStandard.js';

/**
 * Utility for parsing NASA's DE440 ephemeris data in ASCII format.
 * This handles the detailed parsing of the header and data records,
 * extracting Chebyshev polynomial coefficients for planetary positions.
 *
 * @alias DE440EphemerisParser
 * @constructor
 *
 * @see EphemerisData
 */
function DE440EphemerisParser() {
    // Initialize properties
    this._constants = {};
    this._startDate = undefined;
    this._endDate = undefined;
    this._timeStep = undefined;
    
    // Coefficient metadata for each body (from GROUP 1050)
    this._coefficientInfo = {};
    
    // Map of body names to their indices in the DE440 format
    this._bodyIndices = {
        MERCURY: 0,
        VENUS: 1,
        EARTH_MOON_BARYCENTER: 2,
        MARS: 3,
        JUPITER: 4,
        SATURN: 5,
        URANUS: 6,
        NEPTUNE: 7,
        PLUTO: 8,
        MOON: 9,     // Geocentric (relative to Earth)
        SUN: 10,
        EARTH_NUTATIONS: 11,
        LUNAR_LIBRATIONS: 12,
        LUNAR_ANGULAR_VELOCITY: 13,
        TT_TDB: 14
    };
    
    // Reverse mapping from indices to names
    this._bodyNames = {};
    for (const name in this._bodyIndices) {
        if (this._bodyIndices.hasOwnProperty(name)) {
            this._bodyNames[this._bodyIndices[name]] = name;
        }
    }
}

/**
 * Parses the DE440 header file to extract metadata and coefficient information.
 * 
 * @param {String} headerText The text content of the header file.
 * @returns {Object} The parsed header information including constants and coefficient info.
 * @throws {RuntimeError} If required sections are not found in the header.
 */
DE440EphemerisParser.prototype.parseHeader = function(headerText) {
    // Split the header into lines
    const lines = headerText.split('\n');
    
    // Find and parse GROUP 1010 section (description)
    let description = '';
    let i = 0;
    while (i < lines.length && lines[i].trim() !== 'GROUP   1010') {
        i++;
    }
    
    if (i < lines.length) {
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('GROUP')) {
            const line = lines[i].trim();
            if (line !== '') {
                description += line + '\n';
            }
            i++;
        }
    }
    
    // Find and parse GROUP 1030 section (date range and step size)
    i = 0;
    while (i < lines.length && lines[i].trim() !== 'GROUP   1030') {
        i++;
    }
    
    if (i >= lines.length) {
        throw new RuntimeError('Cannot find GROUP 1030 in the header file.');
    }
    
    i++;
    while (i < lines.length && lines[i].trim() === '') {
        i++;
    }
    
    if (i < lines.length) {
        const timeInfo = lines[i].trim().split(/\s+/);
        if (timeInfo.length >= 3) {
            const startJD = parseFloat(timeInfo[0]);
            const endJD = parseFloat(timeInfo[1]);
            const timeStep = parseFloat(timeInfo[2]);
            
            this._startDate = new JulianDate(startJD, 0.0, TimeStandard.TDB);
            this._endDate = new JulianDate(endJD, 0.0, TimeStandard.TDB);
            this._timeStep = timeStep;
        }
    }
    
    // Find and parse GROUP 1040/1041 section (constants)
    i = 0;
    while (i < lines.length && lines[i].trim() !== 'GROUP   1040') {
        i++;
    }
    
    if (i >= lines.length) {
        throw new RuntimeError('Cannot find GROUP 1040 in the header file.');
    }
    
    // Skip to the next line and read the number of constants
    i++;
    const numConstants = parseInt(lines[i].trim());
    
    // Read constant names (GROUP 1040)
    i++;
    const constantNames = [];
    while (constantNames.length < numConstants && i < lines.length) {
        const line = lines[i].trim();
        if (line !== '') {
            const names = line.split(/\s+/);
            for (let j = 0; j < names.length; j++) {
                constantNames.push(names[j]);
            }
        }
        i++;
    }
    
    // Find GROUP 1041 that contains the constant values
    i = 0;
    while (i < lines.length && lines[i].trim() !== 'GROUP   1041') {
        i++;
    }
    
    if (i >= lines.length) {
        throw new RuntimeError('Cannot find GROUP 1041 in the header file.');
    }
    
    // Skip to the next line and read the number of constants (should match)
    i++;
    const numConstantsCheck = parseInt(lines[i].trim());
    if (numConstantsCheck !== numConstants) {
        throw new RuntimeError('Mismatch in number of constants between GROUP 1040 and GROUP 1041.');
    }
    
    // Read constant values (GROUP 1041)
    i++;
    const constantValues = [];
    while (constantValues.length < numConstants && i < lines.length) {
        const line = lines[i].trim();
        if (line !== '') {
            const values = line.split(/\s+/);
            for (let j = 0; j < values.length; j++) {
                // DE format uses D for exponent, replace with E for JavaScript parsing
                const value = values[j].replace('D', 'E');
                constantValues.push(parseFloat(value));
            }
        }
        i++;
    }
    
    // Combine names and values into constants object
    for (let j = 0; j < constantNames.length && j < constantValues.length; j++) {
        this._constants[constantNames[j]] = constantValues[j];
    }
    
    // Find and parse GROUP 1050 section (coefficient information)
    i = 0;
    while (i < lines.length && lines[i].trim() !== 'GROUP   1050') {
        i++;
    }
    
    if (i >= lines.length) {
        throw new RuntimeError('Cannot find GROUP 1050 in the header file.');
    }
    
    // Skip to the next line
    i++;
    while (i < lines.length && lines[i].trim() === '') {
        i++;
    }
    
    // Parse the three rows of GROUP 1050
    const row1 = []; // Starting position in data record
    const row2 = []; // Number of coefficients per component
    const row3 = []; // Number of sets of coefficients per record
    
    // Parse first row - starting positions
    if (i < lines.length) {
        const startPositions = lines[i].trim().split(/\s+/);
        for (let j = 0; j < startPositions.length; j++) {
            row1.push(parseInt(startPositions[j]));
        }
        i++;
    }
    
    // Parse second row - coefficients per component
    if (i < lines.length) {
        const coeffsPerComponent = lines[i].trim().split(/\s+/);
        for (let j = 0; j < coeffsPerComponent.length; j++) {
            row2.push(parseInt(coeffsPerComponent[j]));
        }
        i++;
    }
    
    // Parse third row - number of coefficient sets
    if (i < lines.length) {
        const numSets = lines[i].trim().split(/\s+/);
        for (let j = 0; j < numSets.length; j++) {
            row3.push(parseInt(numSets[j]));
        }
    }
    
    // Store the coefficient information for each body
    for (let j = 0; j < row1.length && j < row2.length && j < row3.length; j++) {
        const bodyName = this._bodyNames[j];
        if (defined(bodyName)) {
            this._coefficientInfo[bodyName] = {
                startPosition: row1[j] - 1, // Convert from 1-indexed to 0-indexed
                coeffsPerComponent: row2[j],
                numSets: row3[j],
                numComponents: this._getNumComponents(j),
                totalCoeffs: this._getNumComponents(j) * row2[j]
            };
        }
    }
    
    // Return the parsed header information
    return {
        description: description.trim(),
        startDate: this._startDate,
        endDate: this._endDate,
        timeStep: this._timeStep,
        constants: this._constants,
        coefficientInfo: this._coefficientInfo
    };
};

/**
 * Parses a data record from the DE440 ASCII data file.
 * 
 * @param {String[]} lines The lines of text for a single data record.
 * @param {Number} startLine The index of the first line of the record.
 * @returns {Object} The parsed data record with coefficients for each body.
 */
DE440EphemerisParser.prototype.parseDataRecord = function(lines, startLine) {
    let i = startLine;
    
    // First line contains the start and end dates for this record
    const dateLine = lines[i].trim();
    const dateValues = dateLine.split(/\s+/);
    
    if (dateValues.length < 2) {
        throw new RuntimeError('Invalid date line in data record: ' + dateLine);
    }
    
    // Parse the start and end dates (replace D with E for JavaScript exponent notation)
    const startJD = parseFloat(dateValues[0].replace('D', 'E'));
    const endJD = parseFloat(dateValues[1].replace('D', 'E'));
    
    // Create the record object
    const record = {
        startDate: new JulianDate(startJD, 0.0, TimeStandard.TDB),
        endDate: new JulianDate(endJD, 0.0, TimeStandard.TDB),
        coefficients: {}
    };
    
    // Move to the next line for coefficients
    i++;
    
    // Parse coefficients for each body
    const allCoefficients = [];
    
    // First, read all values into a single array
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Check for the end of the data record or a new record
        if (line === '' || line.startsWith('GROUP') || (line.indexOf('D') === -1 && line.indexOf('E') === -1)) {
            break;
        }
        
        // Split the line into values
        const values = line.split(/\s+/);
        for (let j = 0; j < values.length; j++) {
            // DE format uses D for exponent, replace with E for JavaScript parsing
            const value = values[j].replace('D', 'E');
            allCoefficients.push(parseFloat(value));
        }
        
        i++;
    }
    
    // Now, distribute the coefficients to the appropriate bodies
    for (const bodyName in this._coefficientInfo) {
        if (this._coefficientInfo.hasOwnProperty(bodyName)) {
            const info = this._coefficientInfo[bodyName];
            
            // Skip bodies with no coefficients in this record
            if (info.numSets === 0) {
                continue;
            }
            
            const bodyIndex = this._bodyIndices[bodyName];
            const startPos = info.startPosition;
            const numComponents = info.numComponents;
            const coeffsPerComponent = info.coeffsPerComponent;
            
            // Initialize coefficient arrays for this body
            const bodyCoeffs = [];
            for (let j = 0; j < numComponents; j++) {
                bodyCoeffs.push([]);
            }
            
            // Extract the coefficients for each component
            for (let set = 0; set < info.numSets; set++) {
                for (let comp = 0; comp < numComponents; comp++) {
                    const compCoeffs = [];
                    const offset = startPos + set * info.totalCoeffs + comp * coeffsPerComponent;
                    
                    for (let k = 0; k < coeffsPerComponent; k++) {
                        if (offset + k < allCoefficients.length) {
                            compCoeffs.push(allCoefficients[offset + k]);
                        }
                    }
                    
                    bodyCoeffs[comp].push(compCoeffs);
                }
            }
            
            // Store the coefficients for this body
            record.coefficients[bodyName] = bodyCoeffs;
        }
    }
    
    return {
        record: record,
        endLine: i
    };
};

/**
 * Gets the number of components for a given body index.
 * @private
 * @param {Number} bodyIndex The index of the body.
 * @returns {Number} The number of components.
 */
DE440EphemerisParser.prototype._getNumComponents = function(bodyIndex) {
    // Most bodies have 3 components (x, y, z)
    if (bodyIndex <= 10) { // Mercury through Sun
        return 3;
    }
    
    // Earth nutations have 2 components (longitude and obliquity)
    if (bodyIndex === 11) {
        return 2;
    }
    
    // Lunar librations and angular velocity have 3 components
    if (bodyIndex === 12 || bodyIndex === 13) {
        return 3;
    }
    
    // TT-TDB has 1 component
    if (bodyIndex === 14) {
        return 1;
    }
    
    // Default case
    return 3;
};

/**
 * Evaluates a Chebyshev polynomial at a given normalized time.
 * 
 * @param {Number[]} coefficients The Chebyshev coefficients.
 * @param {Number} normalizedTime The normalized time value (between -1 and 1).
 * @returns {Number} The evaluated polynomial value.
 */
DE440EphemerisParser.evaluateChebyshev = function(coefficients, normalizedTime) {
    if (!defined(coefficients) || coefficients.length === 0) {
        return 0.0;
    }
    
    if (coefficients.length === 1) {
        return coefficients[0];
    }
    
    // Evaluate using Clenshaw algorithm for numerical stability
    const n = coefficients.length - 1;
    let b_k1 = 0.0;
    let b_k2 = 0.0;
    let b_k = 0.0;
    const x = normalizedTime;
    
    for (let k = n; k >= 0; k--) {
        b_k = coefficients[k] + 2.0 * x * b_k1 - b_k2;
        b_k2 = b_k1;
        b_k1 = b_k;
    }
    
    return b_k - x * b_k2;
};

/**
 * Gets the derivative of a Chebyshev polynomial at a given normalized time.
 * 
 * @param {Number[]} coefficients The Chebyshev coefficients.
 * @param {Number} normalizedTime The normalized time value (between -1 and 1).
 * @param {Number} timeScale The time scale factor to convert to proper units.
 * @returns {Number} The evaluated polynomial derivative.
 */
DE440EphemerisParser.evaluateChebyshevDerivative = function(coefficients, normalizedTime, timeScale) {
    if (!defined(coefficients) || coefficients.length <= 1) {
        return 0.0;
    }
    
    const n = coefficients.length - 1;
    
    // Compute the derivative coefficients
    const derivCoeffs = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        derivCoeffs[i] = 2.0 * (i + 1) * coefficients[i + 1];
        for (let j = i + 2; j < n; j += 2) {
            derivCoeffs[i] += 2.0 * (j + 1) * coefficients[j + 1];
        }
    }
    
    // Evaluate the derivative polynomial
    const result = DE440EphemerisParser.evaluateChebyshev(derivCoeffs, normalizedTime);
    
    // Scale by the time factor
    return result * (2.0 / timeScale);
};

export default DE440EphemerisParser;