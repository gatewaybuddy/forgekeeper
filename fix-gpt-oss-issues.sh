#!/bin/bash
# Quick fix for GPT-OSS-20B context cutoff and reasoning issues

echo "🔧 Fixing GPT-OSS-20B Configuration Issues..."
echo ""

# Backup .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Backed up .env"

# Fix FRONTEND_MAX_TOKENS
if grep -q "^FRONTEND_MAX_TOKENS=384" .env; then
    sed -i 's/^FRONTEND_MAX_TOKENS=384/FRONTEND_MAX_TOKENS=2048/' .env
    echo "✅ Increased FRONTEND_MAX_TOKENS: 384 → 2048"
else
    echo "ℹ️  FRONTEND_MAX_TOKENS already set (not 384)"
fi

# Disable Harmony (model doesn't support it)
if grep -q "^FRONTEND_USE_HARMONY=1" .env; then
    sed -i 's/^FRONTEND_USE_HARMONY=1/FRONTEND_USE_HARMONY=0/' .env
    echo "✅ Disabled Harmony: FRONTEND_USE_HARMONY=1 → 0"
    echo "   (gpt-oss-20b-mxfp4.gguf doesn't support Harmony protocol)"
else
    echo "ℹ️  FRONTEND_USE_HARMONY already disabled"
fi

echo ""
echo "📝 Changes made:"
echo "   • FRONTEND_MAX_TOKENS=2048 (prevents context cutoff)"
echo "   • FRONTEND_USE_HARMONY=0 (model doesn't support it)"
echo ""
echo "🔄 Restarting frontend container..."
docker compose restart frontend

echo ""
echo "✅ Done! Your configuration has been fixed."
echo ""
echo "🧪 Test it:"
echo '   Ask: "Write a detailed 500-word essay about computing history"'
echo "   - Before: Would cut off around 300 words"
echo "   - After: Should complete the full essay"
echo ""
echo "📚 See DIAGNOSIS_GPT_OSS_ISSUES.md for full details"
