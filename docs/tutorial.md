# Tutorial

This tutorial will teach you how to efficiently create and manage prompts using Imaginr.

## Introduction

When using AI image generation, do you write prompts from scratch every time?

"I want to use that character from before but just change the outfit"
"I want to try a few different hair colors with the same composition"

Copy-pasting and editing text for these tasks is tedious and error-prone.

Imaginr solves this by managing prompts in **structured YAML format**.

---

## Step 1: Create Your First Prompt

Let's start with the simplest possible prompt.

### Traditional Approach (Natural Language)

```
young Japanese woman, long straight hair, wearing t-shirt and jeans
```

This can generate images. But there are some issues with this prompt:

- When you want to change the hair length, where do you edit?
- Want to create variations with just the outfit changed, but where does the outfit begin and end?
- Want to reuse common parts across prompts, but how?

Realistically, a prompt this short won't cause problems. However, in AI image generation, anything you don't specify is left up to the AI (= random), so to get results that match your intent, prompts tend to get increasingly detailed and complex.

### Written in YAML

**File: `99_tutorial/01_getting_started/getting_started.yaml`**

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

outfit:
  top: t-shirt
  bottom: jeans
```

### Key Points

- YAML expresses data in a **hierarchical structure**
- You can nest: `appearance` contains `hair`, which contains `length` and `style`...
- **Everything is easy to find at a glance**
- Check the "Merged YAML" tab to see the final YAML content

---

## Step 2: More Detailed Structuring

Let's create a more detailed prompt.

### In Natural Language...

```
young Japanese woman with long straight chestnut hair and brown eyes, wearing yellow t-shirt and indigo jeans with purple hair ribbon, simple red background
```

As sentences get longer, it becomes harder to tell what's where.

### Written in YAML

**File: `99_tutorial/02_structured/structured.yaml`**

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
    color: chestnut hair
  eyes:
    color: brown

outfit:
  top:
    type: t-shirt
    color: yellow
  bottom:
    type: jeans
    color: indigo
  accessories:
    - purple hair ribbon

environment:
  background: simple background
  color: red
```

### Key Points

- `accessories` is an array (list). Use `-` to list multiple items
- By structuring `outfit.top` further, you make it easier to change specific parts later
- Added `environment` to specify the background

### Why Structure?

As the comparison with natural language shows:

1. **Easy to find** what's where
2. **Easy to change** specific parts (e.g., just the hair color)
3. **Easy to reuse** (explained in the next step)

### Structure is Flexible

You might think "Do I have to memorize this structure?"

**Don't worry. Any structure that makes sense to you is fine.**

For example, to express "white t-shirt", any of these work:

```yaml
# Simple one-liner
outfit: white t-shirt
```

```yaml
# Categorized as a top
outfit:
  top: white t-shirt
```

```yaml
# Color and type separated
outfit:
  top:
    type: t-shirt
    color: white
```

None of these is "correct." Write it in whatever way is **easiest for you to manage**.

- If you often change colors, separating `color` is convenient
- If you don't need that much detail, keep it simple on one line
- You can always restructure later

#### App-Provided Recommended Structure

"Write freely" is easy to say, but it's hard to know what to write at first.

That's why this app suggests recommended structures through the **dictionary feature**:

- **Autocomplete** appears as you type in the editor
- The dictionary has common key names and values pre-registered
- Following dictionary suggestions naturally leads to organized structure
- The right side of suggestions shows "which dictionary context they came from"

However, this is just a **guide**. Using structures not in the dictionary is perfectly fine. You can freely edit and add to the dictionary from the settings dialog.

Customize it to fit your workflow.

---

## Step 3: Inheritance - Reusing a Base

This is where Imaginr really shines.

When you want to use the same character but just change the outfit, are you copying and editing files?

With **inheritance**, you can put common parts in one file and write only the differences in separate files.

### Base File

**File: `99_tutorial/03_inheritance/base.yaml`**

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
```

This defines just the basic character settings.

### Child File 1: Casual Outfit

**File: `99_tutorial/03_inheritance/child1.yaml`**

```yaml
_base: 99_tutorial/03_inheritance/base.yaml

outfit:
  top: t-shirt
  bottom: jeans

pose:
  base: standing
  action: hands on hips
```

### Child File 2: Formal Outfit

**File: `99_tutorial/03_inheritance/child2.yaml`**

```yaml
_base: 99_tutorial/03_inheritance/base.yaml

outfit:
  dress: evening dress
  legwear: stockings
  footwear: ankle strap heels

pose:
  base: standing
  action: hand in own hair
```

### Key Points

- Specifying a parent file with `_base` **inherits** its content
- In child files, write only the **parts you want to add or override**
- Modifying base.yaml reflects in both child1 and child2

### Benefits

- **Change one place, update everything**
- **Manage only the differences**, keeping files simple
- **Easy to create variations**

---

## Step 4: Layers - Combining Parts

Inheritance is about "parent-child relationships." But sometimes you want to "combine parts" more flexibly.

For example:
- A "streetwear" outfit set
- A "studio photography" environment set

Being able to freely combine these would be convenient.

### Layer Files

**File: `99_tutorial/04_layers_library/layers/streetwear.yaml`**

```yaml
outfit:
  top: hoodie
  bottom: oversized jogger pants
  shoes: sneakers
```

**File: `99_tutorial/04_layers_library/layers/studio.yaml`**

```yaml
environment:
  background: studio background
  lighting: softbox lighting
```

### Using Them Together

**File: `99_tutorial/04_layers_library/child1.yaml`**

```yaml
_base: 99_tutorial/04_layers_library/base.yaml

_layers:
  - 99_tutorial/04_layers_library/layers/streetwear.yaml
  - 99_tutorial/04_layers_library/layers/studio.yaml

pose:
  base: standing
  action: peace sign
```

### Key Points

- `_layers` is an array that can specify multiple files
- Applied in order from top to bottom, with later files overwriting earlier ones
- **Application order**: `_base` → `_layers` (in sequence) → self

### When to Use Which

| Feature | Use case |
|---------|----------|
| `_base` | "Based on X" parent-child relationship |
| `_layers` | "Combining X and Y" mix-and-match |

---

## Step 5: Variables - Dynamic Value Changes

Finally, learn how to use **variables** to generate different variations from the same template.

**File: `99_tutorial/05_variables/base.yaml`**

```yaml
subject: person

demographics:
  gender: ${gender}
  age: ${age}
  ethnicity: Japanese

appearance:
  hair:
    length: ${hair_length}
    style: ${hair_style}
```

**File: `99_tutorial/05_variables/child.yaml`**

```yaml
_base: 99_tutorial/05_variables/base.yaml

outfit:
  top: t-shirt
  bottom: jeans

environment:
  background: simple background
  color: ${background_color}
```

### Key Points

- Define variables with the `${variableName}` format
- When you select a file, a variable input form appears in the bottom-left of the screen
- Enter values and they're reflected in real-time in the YAML
- Works with inheritance and layers too (though overwriting a variable with a fixed value removes the variable)

### Convenient Uses

- **Try different hairstyles**: Just change `${hair_style}`
- **Background color variations**: Just change `${background_color}`
- **Create both male and female with same composition**: Just change `${gender}`

### Preset Feature

Save frequently used variable combinations as "presets".

1. Enter values for variables
2. Click "Save Preset"
3. Give it a name and save

Next time, just select the preset to recall the same settings.

---

## Summary

| Feature | What it does |
|---------|--------------|
| YAML Structuring | Organize and manage prompts |
| `_base` | Inherit and reuse common parts |
| `_layers` | Freely combine parts |
| `${variable}` | Change values dynamically |

Combining these makes prompt management dramatically easier.

---

## Next Steps

- Create a base file for your own character
- Build an outfit and background layer library
- Turn frequently changed parts into variables

Happy prompting!

---

## Reference

- [YAPS Specification](YAPS.md) - Structured schema details (advanced)
