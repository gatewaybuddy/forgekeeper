/**
 * Adds two numbers together with error handling
 * @param {number} a - First number to add
 * @param {number} b - Second number to add
 * @returns {number} The sum of a and b
 * @throws {TypeError} If either argument is not a number
 * @throws {RangeError} If either argument is NaN or Infinity
 */
function addNumbers(a, b) {
  // Type checking
  if (typeof a !== 'number') {
    throw new TypeError(`First argument must be a number, got ${typeof a}`);
  }
  
  if (typeof b !== 'number') {
    throw new TypeError(`Second argument must be a number, got ${typeof b}`);
  }
  
  // Check for NaN
  if (Number.isNaN(a)) {
    throw new RangeError('First argument cannot be NaN');
  }
  
  if (Number.isNaN(b)) {
    throw new RangeError('Second argument cannot be NaN');
  }
  
  // Check for Infinity
  if (!Number.isFinite(a)) {
    throw new RangeError('First argument must be a finite number');
  }
  
  if (!Number.isFinite(b)) {
    throw new RangeError('Second argument must be a finite number');
  }
  
  // Perform addition
  return a + b;
}

// Example usage with error handling
if (require.main === module) {
  console.log('Testing addNumbers function:\n');
  
  // Valid cases
  try {
    console.log('✓ addNumbers(5, 3):', addNumbers(5, 3));
    console.log('✓ addNumbers(-10, 20):', addNumbers(-10, 20));
    console.log('✓ addNumbers(0.1, 0.2):', addNumbers(0.1, 0.2));
  } catch (error) {
    console.error('✗ Unexpected error:', error.message);
  }
  
  console.log('\nError handling tests:\n');
  
  // Invalid cases
  try {
    addNumbers('5', 3);
  } catch (error) {
    console.log('✓ Caught type error:', error.message);
  }
  
  try {
    addNumbers(5, null);
  } catch (error) {
    console.log('✓ Caught type error:', error.message);
  }
  
  try {
    addNumbers(NaN, 5);
  } catch (error) {
    console.log('✓ Caught range error:', error.message);
  }
  
  try {
    addNumbers(Infinity, 5);
  } catch (error) {
    console.log('✓ Caught range error:', error.message);
  }
}

module.exports = addNumbers;
