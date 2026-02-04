#!/bin/bash
# Add TODO comments to empty catch blocks
find src -name "*.tsx" -o -name "*.ts" | while read file; do
  sed -i 's/} catch {}/} catch {\n      \/\/ TODO: Add error handling\n    }/g' "$file"
  sed -i 's/catch {}/catch {\n        \/\/ TODO: Add error handling\n      }/g' "$file"
  sed -i 's/catch { }/catch {\n        \/\/ TODO: Add error handling\n      }/g' "$file"
done
