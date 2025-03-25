/**
 * Simple debug script for DE440 ephemeris parser
 */

const fs = require('fs');
const path = require('path');

/**
 * Reads a file and returns its contents as a string
 */
function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Analyzes a DE440 format file
 */
function analyzeFile(filePath) {
  console.log(`Analyzing file: ${filePath}`);
  
  try {
    const content = readFile(filePath);
    console.log(`File size: ${content.length} bytes`);
    
    // Split into lines for analysis
    const lines = content.split('\n');
    console.log(`Number of lines: ${lines.length}`);
    
    // Look for GROUP markers
    const groups = {};
    let currentGroup = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('GROUP')) {
        const match = line.match(/GROUP\s+(\d+)/);
        if (match) {
          const groupId = match[1];
          if (!groups[groupId]) {
            groups[groupId] = { start: i, count: 0 };
          }
          currentGroup = groupId;
        }
      } else if (currentGroup && line) {
        groups[currentGroup].count++;
      }
    }
    
    // Report on found groups
    console.log('Groups found:');
    for (const [groupId, info] of Object.entries(groups)) {
      console.log(`  Group ${groupId}: ${info.count} lines, starts at line ${info.start + 1}`);
      
      // Print first few lines of each group
      console.log('    First lines:');
      for (let i = 0; i < Math.min(3, info.count); i++) {
        const lineIndex = info.start + 1 + i;
        if (lineIndex < lines.length) {
          console.log(`      ${lines[lineIndex].slice(0, 100)}${lines[lineIndex].length > 100 ? '...' : ''}`);
        }
      }
    }
    
    return {
      success: true,
      groups: Object.keys(groups)
    };
  } catch (error) {
    console.error(`Error analyzing file: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Check if file path is provided
const filePath = process.argv[2];
if (!filePath) {
  console.error('Please provide a file path to analyze');
  console.log('Usage: node debug.js <file_path>');
  process.exit(1);
}

// Run the analysis
const result = analyzeFile(filePath);
console.log('\nAnalysis summary:');
console.log(result);