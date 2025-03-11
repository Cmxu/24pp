import fs from 'fs';

// Generate all possible values (targets from 100 to 999, no zeros)
const generatePossibleValues = () => {
  const result = [];
  for (let i = 100; i < 1000; i++) {
    if (!i.toString().includes('0')) {
      result.push(i);
    }
  }
  return result;
};

// Encode a key list (sorted hand of 7 cards) into the compressed format
const encodeKey = (keyList) => {
  const counts = Array(9).fill(0);
  for (const num of keyList) {
    if (num >= 1 && num <= 9) {
      counts[num - 1]++;
    }
  }
  
  // Convert counts to a 27-bit string (3 bits per number for 9 numbers)
  let bitStr = '';
  for (const count of counts) {
    bitStr += count.toString(2).padStart(3, '0');
  }
  
  // Convert bit string to number
  const num = parseInt(bitStr, 2);
  
  // Convert to bytes and then to base64
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(num);
  
  // Convert to base64
  return buffer.toString('base64');
};

// Encode a value list into a bit string
const encodeValue = (valueList, possibleValues) => {
  const valueSet = new Set(valueList);
  
  // Calculate how many bytes we need
  const numBits = possibleValues.length;
  const numBytes = Math.ceil(numBits / 8);
  
  // Create a buffer filled with zeros
  const buffer = Buffer.alloc(numBytes);
  
  // Set bits for each value in the value list
  for (let i = 0; i < possibleValues.length; i++) {
    if (valueSet.has(possibleValues[i])) {
      const byteIndex = Math.floor(i / 8);
      const bitPosition = 7 - (i % 8); // MSB first
      buffer[byteIndex] |= (1 << bitPosition);
    }
  }
  
  // Convert to base64
  return buffer.toString('base64');
};

// Compress the dictionary
const compressDict = (originalDict, possibleValues) => {
  const compressed = {};
  
  for (const [keyStr, valueList] of Object.entries(originalDict)) {
    const keyList = JSON.parse(keyStr);
    const encodedKey = encodeKey(keyList);
    const encodedValue = encodeValue(valueList, possibleValues);
    compressed[encodedKey] = encodedValue;
  }
  
  return compressed;
};

// Main function to compress solvable.json
const compressSolvableJson = () => {
  console.log('Reading solvable.json...');
  const solvableData = JSON.parse(fs.readFileSync('solvable.json', 'utf8'));
  
  console.log('Generating possible values...');
  const possibleValues = generatePossibleValues();
  
  console.log('Compressing dictionary...');
  const compressedData = compressDict(solvableData, possibleValues);
  
  console.log('Writing compressed_solvable.json...');
  fs.writeFileSync('public/compressed_solvable.json', JSON.stringify(compressedData));
  
  // Calculate compression ratio
  const originalSize = fs.statSync('solvable.json').size;
  const compressedSize = fs.statSync('public/compressed_solvable.json').size;
  const compressionRatio = (1 - (compressedSize / originalSize)) * 100;
  
  console.log(`Compression complete!`);
  console.log(`Original size: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Compressed size: ${(compressedSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Compression ratio: ${compressionRatio.toFixed(2)}%`);
};

// Run the compression
compressSolvableJson(); 