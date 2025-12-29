# Imaginr - YAML Prompt Builder for AI Image Generation

English | [日本語](README_ja.md)

**Struggling to manage your AI image generation prompts?**

## Sound familiar?

- Prompts get long and you lose track of what's where
- "Where did that prompt go that worked so well last time?"
- Want to change just the hair color, but have to copy-paste and edit everything...
- Similar prompts scattered everywhere, impossible to organize

The more you use AI image generation, the longer and more complex your prompts become. Managing them as plain text has its limits.

## The Solution: Structure Your Prompts

**Before (Natural Language)**
```
young Japanese woman with long straight chestnut hair and brown eyes,
wearing yellow t-shirt and indigo jeans, standing, peace sign,
simple red background, professional lighting
```

Where does the outfit end? How do you change just the hair color?

**After (YAML Structure)**
```yaml
subject: person

demographics:
  gender: woman
  age: young
  ethnicity: Japanese

appearance:
  hair:
    length: long hair
    style: straight hair
    color: ${hair_color}  # ← Use variables for easy changes

outfit:
  top: t-shirt
  bottom: jeans
```

- **Hierarchical structure** keeps things organized and easy to navigate
- **Inheritance & composition** lets you reuse common parts
- **Variables** make dynamic value changes a breeze

## What is Imaginr?

A desktop app for easily creating and managing "structured prompts".

![Imaginr Screenshot](docs/images/screenshot.png)

### Key Features

| Feature | What it does |
|---------|--------------|
| **Template Inheritance** | Use `_base` to share common settings across files, only manage the differences |
| **Layer Composition** | Use `_layers` to freely combine outfit, lighting, pose modules |
| **Variable System** | `${varName}` lets you switch hair color, background, etc. with one click |
| **Autocomplete** | Dictionary-based input completion with source context display |
| **Dictionary Manager** | Add, edit, delete, import/export dictionary entries from within the app |
| **Multi-tab & Split** | Open multiple files in tabs, edit side-by-side with split view |
| **ComfyUI Integration** | Select workflow → Generate → Image generation, gallery management |
| **LLM Enhancer** | Ollama integration to transform YAML into natural language prompts |

### Who is this for?

- People who want to **systematically manage** their prompts
- People who want to create **variations** of the same character
- ComfyUI users who want to **streamline** prompt creation

## Installation

Download the latest version from [Releases](https://github.com/nichiki/imaginr/releases).

| OS | File |
|----|------|
| Windows | `.msi` or `.exe` |
| macOS | `.dmg` |

## Quick Start

1. Launch the app
2. Select a sample template from the left pane
3. Review and edit the content in the central editor
4. If there are variables, enter values in the bottom-left form
5. If ComfyUI is connected, click "Generate" to create images

See the [Tutorial](docs/tutorial.md) for more details.

## Documentation

- [Tutorial](docs/tutorial.md) - Start here if you're new
- [Manual](docs/manual.md) - Complete feature reference
- [YAPS Specification](docs/YAPS.md) - Structured schema details

---

## For Developers

### Tech Stack

| Area | Technology |
|------|------------|
| Desktop | Tauri 2 |
| Frontend | Next.js 16 + React 19 |
| Editor | Monaco Editor |
| Database | SQLite (tauri-plugin-sql) |
| UI | shadcn/ui + Tailwind CSS v4 |

### Commands

```bash
npm install          # Install dependencies
npm run tauri:dev    # Development mode
npm run tauri:build  # Build
npm run lint         # Lint
```

### Directory Structure

```
src/          # Next.js frontend
src-tauri/    # Tauri Rust backend
data/         # Bundled resources (templates, dictionary, snippets)
docs/         # Documentation
```

## License

MIT
