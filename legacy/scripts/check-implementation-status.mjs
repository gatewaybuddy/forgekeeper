#!/usr/bin/env node
/**
 * Implementation Status Checker
 * Validates that all modules are properly implemented, tested, and validated
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const statusFile = path.join(__dirname, '../.implementation-status.json')
const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'))

console.log('\n=== Implementation Status Report ===\n')
console.log(`Project: ${status.project}`)
console.log(`Sprint: ${status.sprint}`)
console.log(`Started: ${status.startDate}\n`)

// Module status
const total = status.modules.length
const implemented = status.modules.filter(m => m.status === 'IMPLEMENTED').length
const inProgress = status.modules.filter(m => m.status === 'IN_PROGRESS').length
const notStarted = status.modules.filter(m => m.status === 'NOT_STARTED').length
const stubs = status.modules.filter(m => m.status === 'STUB').length
const tested = status.modules.filter(m => m.tested).length
const validated = status.modules.filter(m => m.functionallyValidated).length

console.log('📊 Module Status:')
console.log(`   Total: ${total}`)
console.log(`   ✅ Implemented: ${implemented}/${total} (${Math.round(implemented/total*100)}%)`)
console.log(`   🔄 In Progress: ${inProgress}/${total}`)
console.log(`   ⏸️  Not Started: ${notStarted}/${total}`)
console.log(`   ⚠️  Stubs: ${stubs}/${total}`)
console.log()

console.log('🧪 Testing Status:')
console.log(`   Tested: ${tested}/${total} (${Math.round(tested/total*100)}%)`)
console.log(`   Validated: ${validated}/${total} (${Math.round(validated/total*100)}%)`)
console.log()

console.log('✓ Validation Tests:')
console.log(`   Stub Detection: ${status.validationTests.stubDetection ? '✅' : '❌'}`)
console.log(`   Functional Validation: ${status.validationTests.functionalValidation ? '✅' : '❌'}`)
console.log(`   Integration Wiring: ${status.validationTests.integrationWiring ? '✅' : '❌'}`)
console.log()

console.log('🔗 Integration Tests:')
console.log(`   Total: ${status.integrationTests.length}`)
status.integrationTests.forEach(test => {
  const statusIcon = test.status === 'PASSING' ? '✅' : test.status === 'FAILING' ? '❌' : '⏸️'
  console.log(`   ${statusIcon} ${test.name}`)
})
console.log()

console.log('🎯 E2E Tests:')
console.log(`   Total: ${status.e2eTests.length}`)
status.e2eTests.forEach(test => {
  const statusIcon = test.status === 'PASSING' ? '✅' : test.status === 'FAILING' ? '❌' : '⏸️'
  console.log(`   ${statusIcon} ${test.name}`)
})
console.log()

// Find issues
const issues = []
const warnings = []

status.modules.forEach(module => {
  // Critical issues
  if (module.status === 'IMPLEMENTED' && !module.tested) {
    issues.push(`${module.name}: Implemented but not tested`)
  }
  if (module.status === 'IMPLEMENTED' && !module.functionallyValidated) {
    issues.push(`${module.name}: Implemented but not validated`)
  }
  if (module.status === 'STUB') {
    issues.push(`${module.name}: Still a stub (placeholder code)`)
  }

  // Warnings
  if (module.status === 'IMPLEMENTED' && module.coverage < 80) {
    warnings.push(`${module.name}: Low test coverage (${module.coverage}% < 80%)`)
  }
  if (module.status === 'IN_PROGRESS') {
    warnings.push(`${module.name}: In progress`)
  }
})

// Check for missing integration tests
status.modules.forEach(module => {
  if (module.status === 'IMPLEMENTED') {
    const hasIntegrationTest = status.integrationTests.some(test =>
      test.modules.includes(module.name)
    )
    if (!hasIntegrationTest && module.integrationPoints.length > 0) {
      warnings.push(`${module.name}: Missing integration tests`)
    }
  }
})

if (warnings.length > 0) {
  console.log('⚠️  Warnings:')
  warnings.forEach(warning => console.log(`   - ${warning}`))
  console.log()
}

if (issues.length > 0) {
  console.log('❌ Issues:')
  issues.forEach(issue => console.log(`   - ${issue}`))
  console.log()
  console.log('Status: FAILED\n')
  process.exit(1)
}

// Check readiness
const allImplemented = implemented === total
const allTested = tested === total
const allValidated = validated === total
const noStubs = stubs === 0

if (allImplemented && allTested && allValidated && noStubs) {
  console.log('✅ Status: ALL SYSTEMS GO')
  console.log('   All modules implemented, tested, and validated\n')
  process.exit(0)
} else if (allImplemented && noStubs) {
  console.log('⚠️  Status: IMPLEMENTED BUT NOT READY')
  console.log('   All modules implemented but testing incomplete\n')
  process.exit(0)
} else {
  console.log('🔄 Status: IN PROGRESS')
  console.log(`   ${total - implemented} module(s) remaining\n`)
  process.exit(0)
}
