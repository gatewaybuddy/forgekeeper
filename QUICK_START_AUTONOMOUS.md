# 🤖 Quick Start: Autonomous Mode

Get started with autonomous mode in 60 seconds!

## 🚀 Quick Start

### 1. Start the Server

```bash
cd forgekeeper/frontend
npm run serve
```

### 2. Open the App

Navigate to: `http://localhost:3000`

### 3. Try It!

**Option A: Use the Autonomous Panel** (at top of page)
- Enter: `"Create a Python hello world script and test it"`
- Click **Start**
- Watch it work!

**Option B: Use Auto Mode in Chat**
- Click the green **🤖 Auto Mode** button
- Enter: `"Analyze this codebase and create a summary"`
- Click **Start**
- See results in chat + reasoning box

## 📋 Example Tasks

### Beginner (2-4 iterations)
```
Create a Python hello world script and test it
List all JavaScript files in the frontend directory
Read package.json and summarize the dependencies
```

### Intermediate (5-8 iterations)
```
Create a Python calculator with add, subtract, multiply, divide. Write tests and run them.
Find all TypeScript files and summarize what each component does
Analyze the autonomous agent code and document the main classes
```

### Advanced (10-15 iterations)
```
Create a CLI tool that counts lines of code, include tests, run them, and create a README
Analyze the frontend/core directory and create comprehensive architecture documentation
Improve the session memory to track failure patterns, test it, and document the changes
```

## 🎯 What It Can Do

- ✅ **Multi-step workflows**: Create → Test → Verify
- ✅ **Research tasks**: Analyze codebases, find patterns
- ✅ **Documentation**: Generate READMEs, architecture docs
- ✅ **Self-improvement**: Analyze and enhance its own systems
- ✅ **Learn from experience**: Gets better with each session

## 🔧 API Quick Reference

**Start async session**:
```bash
curl -X POST http://localhost:3000/api/chat/autonomous \
  -H "Content-Type: application/json" \
  -d '{"task": "Create hello.py", "async": true}'
```

**Poll status**:
```bash
curl "http://localhost:3000/api/chat/autonomous/status?session_id=YOUR_SESSION_ID"
```

**Stop session**:
```bash
curl -X POST http://localhost:3000/api/chat/autonomous/stop \
  -H "Content-Type: application/json" \
  -d '{"session_id": "YOUR_SESSION_ID"}'
```

## 📚 Full Documentation

- **Complete Guide**: `AUTONOMOUS_MODE_COMPLETE.md`
- **Enhancements**: `AUTONOMOUS_MODE_ENHANCEMENTS.md`
- **User Manual**: `AUTONOMOUS_MODE_READY.md`

---

**That's it! The agent is ready to work autonomously on your tasks.** 🚀
