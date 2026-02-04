/**
 * @testfile consciousness/stub-detection
 * @description Validates that no placeholder/stub code exists in production
 *
 * This test prevents the critical issue of mistaking stubs for working code
 * by scanning all consciousness module files for common stub patterns.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const consciousnessDir = path.join(__dirname, '../../')

/**
 * Recursively get all .mjs files in a directory
 * Excludes __tests__ directories
 */
function getAllMjsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== '__tests__' && entry.name !== 'node_modules') {
      getAllMjsFiles(fullPath, files)
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Check if a file appears to be a stub (mostly empty or only has comments)
 */
function isFileStub(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')

  // Remove comments and whitespace
  const codeOnly = content
    .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove block comments
    .replace(/\/\/.*/g, '')             // Remove line comments
    .replace(/^\s*[\r\n]/gm, '')        // Remove empty lines
    .trim()

  // If less than 50 characters of actual code, it's likely a stub
  return codeOnly.length < 50
}

/**
 * Extract function/method signatures from code
 */
function extractFunctions(content) {
  const functions = []

  // Match function declarations
  const functionPattern = /(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g
  let match

  while ((match = functionPattern.exec(content)) !== null) {
    functions.push({
      name: match[1] || match[2],
      position: match.index
    })
  }

  // Match class methods
  const methodPattern = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/g
  while ((match = methodPattern.exec(content)) !== null) {
    functions.push({
      name: match[1],
      position: match.index
    })
  }

  return functions
}

/**
 * Check if a function is just a stub (throws "not implemented" etc.)
 */
function isFunctionStub(content, func) {
  // Get ~200 chars after the function declaration
  const snippet = content.substring(func.position, func.position + 200)

  // Check for common stub patterns
  const stubPatterns = [
    /throw\s+(?:new\s+)?Error\s*\(\s*['"](?:not implemented|TODO|stub|placeholder)['"]/i,
    /console\.log\s*\(\s*['"]TODO/i,
    /return\s+null\s*;?\s*\/\/\s*(?:TODO|stub)/i,
    /\/\/\s*TODO:\s*implement/i
  ]

  return stubPatterns.some(pattern => pattern.test(snippet))
}

describe('Stub Detection Tests', () => {
  describe('File-level stub detection', () => {
    it('should have no empty/stub files in consciousness module', () => {
      const files = getAllMjsFiles(consciousnessDir)
      const stubFiles = []

      files.forEach(file => {
        if (fs.existsSync(file) && isFileStub(file)) {
          stubFiles.push(file)
        }
      })

      if (stubFiles.length > 0) {
        console.error('\nStub files detected:')
        stubFiles.forEach(file => {
          console.error(`  - ${path.relative(consciousnessDir, file)}`)
        })
      }

      expect(stubFiles).toEqual([])
    })
  })

  describe('Code-level stub detection', () => {
    it('should have no TODO/STUB/FIXME/PLACEHOLDER comments in production code', () => {
      const files = getAllMjsFiles(consciousnessDir)
      const violations = []

      files.forEach(file => {
        if (!fs.existsSync(file)) return

        const content = fs.readFileSync(file, 'utf-8')
        const lines = content.split('\n')

        lines.forEach((line, idx) => {
          // Skip JSDoc @status annotations
          if (/@status\s+(STUB|TODO|IN_PROGRESS)/i.test(line)) {
            return
          }

          // Check for stub markers in actual code
          if (/(\/\/\s*TODO|\/\/\s*STUB|\/\/\s*FIXME|\/\/\s*PLACEHOLDER|\/\*\s*TODO)/i.test(line)) {
            violations.push({
              file: path.relative(consciousnessDir, file),
              line: idx + 1,
              content: line.trim()
            })
          }
        })
      })

      if (violations.length > 0) {
        console.error('\nStub comments detected:')
        violations.forEach(v => {
          console.error(`  ${v.file}:${v.line} - ${v.content}`)
        })
      }

      expect(violations).toEqual([])
    })

    it('should have no functions that just throw "not implemented"', () => {
      const files = getAllMjsFiles(consciousnessDir)
      const violations = []

      files.forEach(file => {
        if (!fs.existsSync(file)) return

        const content = fs.readFileSync(file, 'utf-8')
        const functions = extractFunctions(content)

        functions.forEach(func => {
          if (isFunctionStub(content, func)) {
            violations.push({
              file: path.relative(consciousnessDir, file),
              function: func.name
            })
          }
        })
      })

      if (violations.length > 0) {
        console.error('\nStub functions detected:')
        violations.forEach(v => {
          console.error(`  ${v.file} - function ${v.function}()`)
        })
      }

      expect(violations).toEqual([])
    })

    it('should have proper @status annotations in file headers', () => {
      const files = getAllMjsFiles(consciousnessDir)
      const violations = []

      files.forEach(file => {
        if (!fs.existsSync(file)) return

        const content = fs.readFileSync(file, 'utf-8')

        // Check if file has proper header with @status
        if (!/@status\s+(IMPLEMENTED|IN_PROGRESS|STUB)/i.test(content)) {
          violations.push({
            file: path.relative(consciousnessDir, file),
            issue: 'Missing @status annotation in file header'
          })
        } else {
          // Extract status
          const statusMatch = content.match(/@status\s+(IMPLEMENTED|IN_PROGRESS|STUB)/i)
          const status = statusMatch[1]

          // If status is STUB, that's a violation
          if (status === 'STUB') {
            violations.push({
              file: path.relative(consciousnessDir, file),
              issue: '@status marked as STUB'
            })
          }
        }
      })

      if (violations.length > 0) {
        console.error('\nStatus annotation issues:')
        violations.forEach(v => {
          console.error(`  ${v.file} - ${v.issue}`)
        })
      }

      expect(violations).toEqual([])
    })
  })

  describe('Implementation completeness', () => {
    it('should have test files for all implemented modules', () => {
      const statusFile = path.join(consciousnessDir, '../../../.implementation-status.json')

      if (!fs.existsSync(statusFile)) {
        console.warn('Warning: .implementation-status.json not found, skipping test')
        return
      }

      const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'))
      const violations = []

      status.modules.forEach(module => {
        if (module.status === 'IMPLEMENTED' && module.testFiles.length === 0) {
          violations.push(module.name)
        }
      })

      if (violations.length > 0) {
        console.error('\nImplemented modules without tests:')
        violations.forEach(name => {
          console.error(`  - ${name}`)
        })
      }

      expect(violations).toEqual([])
    })

    it('should have @tested annotation matching test existence', () => {
      const files = getAllMjsFiles(consciousnessDir)
      const violations = []

      files.forEach(file => {
        if (!fs.existsSync(file)) return

        const content = fs.readFileSync(file, 'utf-8')
        const testedMatch = content.match(/@tested\s+(true|false)/i)

        if (!testedMatch) {
          violations.push({
            file: path.relative(consciousnessDir, file),
            issue: 'Missing @tested annotation'
          })
          return
        }

        const testedValue = testedMatch[1] === 'true'

        // Check if corresponding test file exists
        const moduleName = path.basename(file, '.mjs')
        const testFilePath = path.join(
          consciousnessDir,
          '__tests__',
          'unit',
          `${moduleName}.test.mjs`
        )
        const hasTest = fs.existsSync(testFilePath)

        if (testedValue && !hasTest) {
          violations.push({
            file: path.relative(consciousnessDir, file),
            issue: '@tested is true but no test file found'
          })
        } else if (!testedValue && hasTest) {
          violations.push({
            file: path.relative(consciousnessDir, file),
            issue: 'Test file exists but @tested is false'
          })
        }
      })

      if (violations.length > 0) {
        console.error('\n@tested annotation mismatches:')
        violations.forEach(v => {
          console.error(`  ${v.file} - ${v.issue}`)
        })
      }

      expect(violations).toEqual([])
    })
  })
})
