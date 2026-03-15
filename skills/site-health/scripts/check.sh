#!/bin/bash
# Site Health Check — edit SITES array with your URLs

SITES=(
  # Format: "URL|Display Name|Expected text (optional)"
  # "https://yoursite.com|Your Site|Welcome"
  # "https://app.yoursite.com|Your App|"
)

if [ ${#SITES[@]} -eq 0 ]; then
  echo "⚠️  No sites configured. Edit SITES array in this script."
  exit 0
fi

FAILED=0

for entry in "${SITES[@]}"; do
  IFS='|' read -r url name expected <<< "$entry"
  
  STATUS=$(curl -s -o /tmp/health_body -w "%{http_code}" -L --max-time 10 "$url" 2>/dev/null)
  
  if [ "$STATUS" -eq 200 ]; then
    if [ -n "$expected" ]; then
      if grep -q "$expected" /tmp/health_body 2>/dev/null; then
        echo "✅ $name ($url) — 200 + content OK"
      else
        echo "❌ $name ($url) — 200 but missing expected text: '$expected'"
        FAILED=1
      fi
    else
      echo "✅ $name ($url) — 200"
    fi
  else
    echo "❌ $name ($url) — HTTP $STATUS"
    FAILED=1
  fi
done

rm -f /tmp/health_body
exit $FAILED
