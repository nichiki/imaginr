# Manual

This document explains Imaginr's features and design philosophy in detail.

If you're new, please check the [Tutorial](tutorial.md) first.

---

## Concepts

### Why Manage Prompts with YAML

AI image generation prompts become longer and more complex as you try to specify more details.

When writing long prompts in natural language:
- Hard to tell where things are
- Finding where to edit when you want to change one part is tedious
- Creating similar prompts means copy-paste and tweaking... prone to mistakes

With YAML structuring:
- Hierarchical structure keeps things organized with good visibility
- Inheritance & composition lets you reuse common parts
- Variables let you change values dynamically

### Prompt Structure: YAPS

Imaginr uses **YAPS (Yet Another Prompt Schema)**, a structured schema.

- Hierarchically organized with keys like `subject`, `pose`, `outfit`, `environment`
- See [YAPS Specification](YAPS.md) for details

YAPS is just a guideline. It's suggested via dictionary autocomplete, but you can freely customize it to fit your workflow.

### 4-Layer Structure: Organizing by Change Frequency

Organizing prompts by "how often they change" makes management easier.

```
Less likely to change (fixed at upper levels)
    │
    ▼
┌─────────────────────────────────────────┐
│ 01_base: System (quality, block order)  │  ← Never changes
├─────────────────────────────────────────┤
│ 02_look: Project level                  │  ← Fixed throughout shoot
│   Subject, location, equipment, aesthetic│
├─────────────────────────────────────────┤
│ 03_layers: Parts library                │  ← Mix and match
│   Lighting, pose, expression patterns   │
├─────────────────────────────────────────┤
│ 04_shot: Shot level                     │  ← Changes per shot
│   Composition, pose, expression, time   │
├─────────────────────────────────────────┤
│ ${variable}: Runtime                    │  ← Changes every time / undecided
└─────────────────────────────────────────┘
    │
    ▼
More likely to change (at lower levels or as variables)
```

| Layer | What to put | Example |
|-------|-------------|---------|
| **01_base** | Never changes, defines all block order | quality tags, block structure |
| **02_look** | Fixed for the project | subject, location, camera, aesthetic |
| **03_layers** | Reusable patterns (horizontal composition) | lighting, pose, expression patterns |
| **04_shot** | Changes per shot | composition, time, background details |
| **${variable}** | Can't decide / want to change each time | hair_color, outfit_top, etc. |

This is just one way to organize. Customize it to fit your workflow.

---

## Feature Reference

### Editor

#### Multiple Tabs

You can open multiple files in tabs.

- **Add tab**: "+" button on the right of the tab bar, or select a file from the file tree
- **Switch tabs**: Click on a tab
- **Close tab**: "×" button on the tab (confirmation if there are unsaved changes)

#### Editor Split

Split the editor left/right to edit two files simultaneously.

- Right-click a tab → "Open in right pane" or "Open in left pane"
- To unsplit, close all tabs in one pane

#### Layout Mode

Switch layouts with the icons in the top-right corner.

| Mode | Description |
|------|-------------|
| **Full view** | Show both upper (editor) and lower (preview/generate) sections |
| **Upper only** | Focus on the editor |
| **Lower only** | Focus on gallery or generate panel |

### Template Inheritance

#### `_base`: Vertical Inheritance (IS-A)

Inherit all content from a parent file and write only the differences.

```yaml
# 04_shot/shot_01.yaml
_base: 02_look/summer_casual.yaml

# Settings specific to this file
pose:
  base: standing
  action: peace sign
```

Modifying the parent file reflects in all child files.

#### `_layers`: Horizontal Composition (HAS-A)

Merge multiple files in order.

```yaml
_base: 02_look/summer_casual.yaml

_layers:
  - 03_layers/lighting/golden_hour.yaml
  - 03_layers/pose/standing.yaml
  - 03_layers/expression/smile.yaml

# Settings specific to this file
environment:
  time: evening
```

**Application order**: `_base` → `_layers` (top to bottom) → self

Later applied content overwrites earlier content.

#### `_replace`: Replace Instead of Merge

By default, objects are deeply merged. If the parent file has a definition, child settings layer on top.

```yaml
# Parent file
outfit:
  top: blazer
  bottom: skirt
  legwear: tights
```

```yaml
# Child file (normal merge)
outfit:
  top: sweater
# → Result: top=sweater, bottom=skirt, legwear=tights (merged)
```

However, sometimes you don't want to inherit the parent's content. Using `_replace` makes the specified keys **fully replace** instead of deep merge.

```yaml
# Child file (using _replace)
_replace:
  - outfit

outfit:
  top: sweater
# → Result: top=sweater only (bottom, legwear are gone)
```

**Use case**: When you want to "completely replace" instead of "partially override" parent settings.

#### `_base` vs `_layers` Comparison

| | `_base` | `_layers` |
|---|---|---|
| **Relationship** | "Is a" (IS-A) | "Has a" (HAS-A) |
| **Use** | Essential inheritance like character settings | Combining parts like lighting, pose |
| **Count** | Only one | Multiple OK |

### Variable System

#### Basic Syntax

```yaml
hair:
  color: ${hair_color}           # variable
  style: ${hair_style|straight}  # with default value
```

- `${variableName}`: Define a variable
- `${variableName|defaultValue}`: Default when no value is entered

#### Variable Input Form

When you select a file containing variables, an input form appears in the bottom-left.
Enter values and they're reflected in real-time in the Merged YAML.

#### Presets

Save frequently used variable combinations as presets.

1. Enter values for variables
2. Click "Save Preset"
3. Give it a name and save

Next time, just select the preset from the dropdown to recall the same settings.

### Dictionary and Autocomplete

#### Dictionary Role

The dictionary has common key names and values pre-registered.

- **Autocomplete** appears as you type in the editor
- Recognizes parent key context to suggest appropriate candidates
- Manual trigger: **Cmd+J** (Mac) / **Ctrl+Space** (Windows)

#### Dictionary Management

Manage the dictionary directly from within the app.

1. Open settings dialog from the gear icon in the header
2. Select "Dictionary Manager"
3. Available operations:
   - **Search & filter**: Filter by keyword or context
   - **Add**: Register new entries
   - **Edit**: Modify existing entries
   - **Delete**: Remove unwanted entries
   - **Import/Export**: Backup and restore in CSV format

#### Autocomplete Details

Autocomplete shows the **source context** on the right side of suggestions.

For example, when editing `outfit.top.color`:
- `*.color` - From generic color dictionary
- `outfit.color` - From outfit-specific color expressions

This information helps you understand which dictionary context suggestions come from.

#### Direct Dictionary File Editing

Dictionary files are also located in the `dictionary/` folder.
You can open the data folder from "Open Data Folder" in the settings dialog and edit directly.

### Snippets

Snippets are a feature for saving frequently used YAML fragments.

#### Difference from `_layers`

| | `_layers` | Snippets |
|---|---|---|
| **Relationship** | Dependency remains | Copy-paste and done |
| **On update** | Original file change → reflects in all shots | Independent after insertion |
| **Use** | Want to unify / bulk change | Just want a starting point |

**Decision criteria: "Will I want to bulk change this later?"**
- YES → Extract to `_layers`
- NO → Snippets are sufficient (or write directly)

#### Operations

Manage in the snippets panel on the right pane.

- **Single click**: Open edit dialog
- **Double click**: Insert at cursor position in editor
- **Right click**: Context menu (delete, etc.)

---

## ComfyUI Integration

### Connection Settings

1. Open settings dialog from the gear icon in the header
2. Select "ComfyUI Settings"
3. Enter API endpoint (default: `http://localhost:8188`)
4. Click "Test" to verify connection

### Workflow Settings

Upload ComfyUI workflow JSON and set up prompt injection targets.
As preparation, export the workflow you want to use in API format.

1. Select "Add" under "ComfyUI Settings"
2. Upload the exported workflow JSON
3. Configure:
   - **Name**: Display name
   - **Prompt Node ID**: Node ID to inject prompt (e.g., CLIPTextEncode)
   - **Sampler Node ID**: Node ID to randomize seed (e.g., KSampler)
   - **Negative Prompt Node ID**: Only if you want to control negative prompt via YAML
   - **Property Overrides**: If you want to override image size, steps, etc.

#### How to Find Node IDs

Open the workflow JSON in a text editor to check.

### Image Generation

1. Select and edit a YAML template
2. Select a workflow (dropdown in generate panel)
3. Click "Generate" button

Generated images are automatically saved and displayed in the gallery.

### Gallery

View generated images in the "Gallery" tab of the preview panel.

- **Thumbnail click**: Enlarged view
- **←→ keys**: Navigate to previous/next image
- **Esc key**: Close enlarged view
- **Download button**: Save image as file

---

## Ollama Integration (LLM Enhancer)

Use Ollama to transform YAML prompts into formats optimized for text encoders.

### Installing Ollama

1. Download installer from [Ollama official site](https://ollama.ai/)
2. After installation, download the model you want in terminal:

```bash
# Example: Llama 3.2
ollama pull llama3.2

# Example: Qwen 2.5
ollama pull qwen2.5
```

### Connection Settings

1. Open settings dialog from the gear icon in the header
2. Select "Ollama Settings"
3. Configure:
   - **API URL**: Ollama endpoint (default: `http://localhost:11434`)
   - **Model**: Select model to use
   - **Temperature**: Generation diversity (0.0-1.0, default: 0.7)
4. Click "Test" to verify connection

### Enhancer Presets

Presets define how to transform YAML into different formats.

| Preset | Use | Output Format |
|--------|-----|---------------|
| **CLIP (SDXL)** | Stable Diffusion XL | Comma-separated tags |
| **T5 (Flux)** | Flux | Natural language sentences |
| **Qwen** | Qwen models (Qwen-Image, etc.) | Detailed natural language |

Select presets from the dropdown. You can also add custom presets with "Add Preset".

### Usage

#### Manual Enhance

1. Select and edit a YAML template
2. Click "Enhance" button in the generate panel
3. Transformed prompt appears in "Enhanced" in the "Prompt" tab

#### Auto-Enhance on Generate

1. Turn on "Enhance before generate" in the generate panel
2. Click "Generate" button
3. Automatically enhances → generates image

### AI Assist (Text-to-Prompt)

Generate YAPS-format YAML from natural language descriptions.

1. Turn on "AI Assist" when creating a new file
2. Enter description of the image you want (e.g., "girl standing on beach at sunset")
3. Click "Create"
4. Generated YAML is inserted into the editor

This feature generates detailed YAML from rough descriptions, suitable for workflows where you refine from there.

---

## FAQ / Tips

### Frequently Asked Questions

#### Q: Does it work in a browser?

A: No, Imaginr is a desktop app only. It accesses the file system and database via Tauri, so it doesn't work in browsers.

#### Q: Where is data saved?

A: Saved in the following locations:
- **Windows**: `%APPDATA%/studio.imaginr/`
- **Mac**: `~/Library/Application Support/studio.imaginr/`

You can open the folder from "Open Data Folder" in the settings dialog.

#### Q: Can I use it without ComfyUI?

A: Yes, prompt creation and management features work standalone. Only image generation requires ComfyUI integration.

#### Q: Can I add my own values to the dictionary?

A: Yes, you can add, edit, and delete from "Dictionary Manager" in the settings dialog. CSV import/export is also available.

#### Q: Is there auto-save?

A: No, there's no auto-save. Save explicitly with **Ctrl+S** (Mac: **Cmd+S**). A "●" mark appears on tabs with unsaved changes.

### Tips

#### Efficient Workflow

1. **Solidify the base first**: Put basic character settings in a `_base` file
2. **Build a layer library**: Create lighting, pose, expression variations with `_layers` for reuse
3. **Variables last**: First work with fixed values, then convert to variables later

#### Keyboard Shortcuts

**General**

| Action | Windows | Mac |
|--------|---------|-----|
| Save | Ctrl+S | Cmd+S |
| Close tab | Ctrl+W | Cmd+W |
| Undo | Ctrl+Z | Cmd+Z |
| Redo | Ctrl+Y | Cmd+Shift+Z |

**Editor**

| Action | Windows | Mac |
|--------|---------|-----|
| Autocomplete | Ctrl+J / Ctrl+Space | Cmd+J |
| Add to dictionary | Ctrl+Shift+D | Cmd+Shift+D |

**Generation**

| Action | Windows | Mac |
|--------|---------|-----|
| Generate image | Ctrl+Enter | Cmd+Enter |
| Enhance prompt | Ctrl+E | Cmd+E |

**Gallery (enlarged view)**

| Action | Key |
|--------|-----|
| Previous image | ← |
| Next image | → |
| Close | Esc |

**Other**

| Action | Operation |
|--------|-----------|
| Open in split editor | Cmd/Ctrl + click on file |
| Range select in gallery | Shift + click |
