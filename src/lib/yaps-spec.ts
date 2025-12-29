// YAPS Specification embedded as a constant
// This is auto-generated from docs/YAPS.md

export const YAPS_SPEC = `# YAPS v1 Specification - Yet Another Prompt Schema

A structured schema specification for AI image generation prompts.

---

## Overview

YAPS (Yet Another Prompt Schema) is a YAML schema for structuring AI image generation prompts.

### Features

- **Use only the keys you need** - No need to fill everything
- **Simple and detailed coexist** - Rough or fine-grained specification both work
- **LLM-friendly** - Clear meaning, easy for AI to understand

### Basic Usage

\`\`\`yaml
# Minimal example
subject: 1girl
pose:
  base: standing
outfit:
  costume: schoolgirl
quality: [masterpiece, best quality]
\`\`\`

---

## Basic Structure

YAPS v1 top-level keys:

| Key | Description | Required |
|-----|-------------|----------|
| \`subject\` | Main subject | ○ |
| \`demographics\` | Person attributes (age, ethnicity, etc.) | - |
| \`pose\` | Pose and posture | - |
| \`expression\` | Facial expression | - |
| \`appearance\` | Physical features | - |
| \`outfit\` | Clothing and costume | - |
| \`environment\` | Background and setting | - |
| \`aesthetic\` | Art style | - |
| \`mood\` | Atmosphere | - |
| \`effects\` | Visual effects | - |
| \`lighting\` | Lighting | - |
| \`composition\` | Composition | - |
| \`photography\` | Photography techniques | - |
| \`quality\` | Quality tags | △ |
| \`negative\` | Negative prompt | △ |
| \`interaction\` | Multi-character interactions | - |

### \`base\` Key (pose, lighting)

For \`pose\` and \`lighting\`, you can specify directly as a string or use the \`base\` key.

\`\`\`yaml
# Direct string (simple)
pose: standing

# Using base key (equivalent)
pose:
  base: standing
\`\`\`

Use the \`base\` key when you want to add details:

\`\`\`yaml
pose:
  base: standing      # ← Overall "standing"
  hands: peace sign   # ← Add specific details

lighting:
  base: dramatic      # ← Overall "dramatic"
  source: window light
\`\`\`

---

## Subject

### subject

**type**: \`string\`

Specifies the main subject. Person, animal, object, landscape, etc.

\`\`\`yaml
# Person (realistic)
subject: person
subject: woman
subject: man

# Person (illustration)
subject: 1girl
subject: 1boy
subject: 2girls

# Non-person
subject: cat
subject: cherry blossom tree
subject: cityscape
\`\`\`

### demographics

**type**: \`object\`

Specifies person attributes.

| Key | Description | Examples |
|-----|-------------|----------|
| \`gender\` | Gender | \`woman\`, \`man\`, \`girl\`, \`boy\`, \`androgynous\` |
| \`ethnicity\` | Ethnicity | \`Japanese\`, \`Asian\`, \`Caucasian\`, \`African\`, \`Hispanic\` |
| \`race\` | Fantasy race | \`human\`, \`elf\`, \`demon\`, \`angel\`, \`catgirl\`, \`kemonomimi\` |
| \`age\` | Age range | \`teenage\`, \`young\`, \`young adult\`, \`middle-aged\`, \`elderly\` |

\`\`\`yaml
demographics:
  gender: woman
  ethnicity: Japanese
  race: elf
  age: young
\`\`\`

> **Note**: \`ethnicity\` refers to real-world ethnicity, \`race\` refers to fantasy races.

---

## Pose

### pose

**type**: \`object\`

Specifies pose and posture.

| Key | Description | Examples |
|-----|-------------|----------|
| \`base\` | Overall pose | \`standing\`, \`sitting\`, \`lying\`, \`jumping\`, \`running\` |
| \`facing\` | Direction/gaze | \`facing viewer\`, \`looking back\`, \`profile\`, \`turned away\` |
| \`action\` | Action | \`walking\`, \`dancing\`, \`fighting\`, \`sleeping\`, \`eating\` |
| \`head\` | Head movement | \`head tilt\`, \`looking up\`, \`looking down\`, \`chin rest\` |
| \`arms\` | Arm movement | \`arms up\`, \`arms crossed\`, \`arm behind head\`, \`reaching out\` |
| \`hands\` | Hand shape | \`hands on hips\`, \`peace sign\`, \`pointing at viewer\`, \`fist\`, \`open palm\` |
| \`legs\` | Leg movement | \`crossed legs\`, \`legs together\`, \`one knee up\` |

\`\`\`yaml
# Simple
pose:
  base: standing

# Detailed
pose:
  base: standing
  facing: looking back
  hands: peace sign
  head: head tilt
\`\`\`

> **Note**: \`facing\` is the model's direction; camera angle (from behind, etc.) is specified in \`composition.angle\`.

---

## Expression

### expression

**type**: \`object\`

Specifies facial expression. Flat structure for ease of use.

| Key | Description | Examples |
|-----|-------------|----------|
| \`emotion\` | Emotion | \`happy\`, \`sad\`, \`angry\`, \`embarrassed\`, \`surprised\`, \`shy\` |
| \`face\` | Expression name | \`smile\`, \`frown\`, \`pout\`, \`smirk\`, \`tears\`, \`blush\` |
| \`eyes\` | Eye state | \`closed eyes\`, \`half-closed eyes\`, \`heart-shaped pupils\`, \`wide-eyed\` |
| \`mouth\` | Mouth state | \`open mouth\`, \`tongue out\`, \`biting lip\`, \`drooling\` |

\`\`\`yaml
expression:
  emotion: happy
  face: smile
  eyes: closed eyes
\`\`\`

---

## Appearance

### appearance

**type**: \`object\`

Specifies physical features.

#### hair

| Key | Description | Examples |
|-----|-------------|----------|
| \`length\` | Length | \`short hair\`, \`medium hair\`, \`long hair\`, \`very long hair\` |
| \`style\` | Style | \`ponytail\`, \`twintails\`, \`braid\`, \`bob cut\`, \`messy hair\`, \`straight hair\` |
| \`color\` | Color | \`blonde hair\`, \`black hair\`, \`pink hair\`, \`blue hair\`, \`gradient hair\`, \`multicolored hair\` |
| \`texture\` | Texture | \`silky\`, \`fluffy\`, \`smooth\`, \`glossy\`, \`wet\` |
| \`bangs\` | Bangs | \`blunt bangs\`, \`swept bangs\`, \`parted bangs\`, \`side bangs\` |
| \`extras\` | Decorations | \`ribbon\`, \`hair pin\`, \`hair ornament\`, \`hair flower\` |

\`\`\`yaml
appearance:
  hair:
    length: long hair
    style: ponytail
    color: blonde hair
    bangs: blunt bangs
    extras: [ribbon]
\`\`\`

#### Face & Skin

| Key | Description | Examples |
|-----|-------------|----------|
| \`eyes\` | Eye color/shape | \`blue eyes\`, \`green eyes\`, \`red eyes\`, \`heterochromia\` |
| \`skin\` | Skin | \`pale skin\`, \`fair skin\`, \`tan skin\`, \`dark skin\`, \`freckles\` |
| \`face\` | Face shape | \`round face\`, \`oval face\`, \`strong jawline\` |
| \`makeup\` | Makeup | \`red lipstick\`, \`smoky eyes\`, \`blush\`, \`natural makeup\` |

#### Build

| Key | Description | Examples |
|-----|-------------|----------|
| \`build\` | Body type | \`slim\`, \`athletic\`, \`curvy\`, \`muscular\`, \`petite\`, \`plump\` |
| \`proportions\` | Proportions | \`chibi\`, \`normal\`, \`model proportions\`, \`8 heads tall\` |

#### Body Parts (when needed)

| Key | Description | Examples |
|-----|-------------|----------|
| \`breast\` | Chest | \`flat chest\`, \`small breasts\`, \`medium breasts\`, \`large breasts\` |
| \`hips\` | Hips | \`wide hips\`, \`narrow hips\` |
| \`waist\` | Waist | \`slim waist\`, \`narrow waist\` |
| \`legs\` | Legs | \`long legs\`, \`thick thighs\`, \`slender legs\` |

#### extras

**type**: \`array\`

\`tattoo\`, \`horns\`, \`halo\`, \`pointed ears\`, \`fangs\`, etc.

\`\`\`yaml
appearance:
  hair:
    color: pink hair
    style: twintails
  eyes: heterochromia
  build: petite
  extras: [pointed ears, horns]
\`\`\`

---

## Outfit

### outfit

**type**: \`object\`

Specifies clothing and costume.

#### Quick Specification

\`\`\`yaml
# Direct string
outfit: casual

# Or with style key
outfit:
  style: casual
\`\`\`

#### One-word Specification (costume/style)

| Key | Description | Examples |
|-----|-------------|----------|
| \`costume\` | Costume | \`nurse\`, \`maid\`, \`witch\`, \`bunny girl\`, \`idol\`, \`schoolgirl\` |
| \`style\` | Style category | \`casual\`, \`formal\`, \`elegant\`, \`gothic\`, \`sporty\` |

\`\`\`yaml
# Specify by costume
outfit:
  costume: maid
\`\`\`

#### Individual Items

| Key | Description | Examples |
|-----|-------------|----------|
| \`top\` | Top | \`shirt\`, \`blouse\`, \`t-shirt\`, \`sweater\`, \`crop top\` |
| \`bottom\` | Bottom | \`skirt\`, \`pants\`, \`shorts\`, \`jeans\` |
| \`dress\` | Dress | \`wedding dress\`, \`evening gown\`, \`sundress\` |
| \`outerwear\` | Outerwear | \`jacket\`, \`coat\`, \`cardigan\`, \`cape\`, \`hoodie\` |
| \`legwear\` | Legwear | \`thigh highs\`, \`pantyhose\`, \`stockings\`, \`knee socks\` |
| \`footwear\` | Footwear | \`high heels\`, \`boots\`, \`sneakers\`, \`barefoot\`, \`sandals\` |
| \`headwear\` | Headwear | \`hat\`, \`crown\`, \`ribbon\`, \`hairband\`, \`beret\` |
| \`swimwear\` | Swimwear | \`bikini\`, \`one-piece swimsuit\`, \`school swimsuit\` |
| \`underwear\` | Underwear | \`bra\`, \`panties\`, \`lingerie\` |
| \`accessories\` | Accessories | \`necklace\`, \`earrings\`, \`glasses\`, \`bag\`, \`watch\` |
| \`props\` | Held items | \`sword\`, \`umbrella\`, \`book\`, \`phone\`, \`cup\` |

#### Item Attributes

For detailed item specification, use these attributes.

| Key | Description | Examples |
|-----|-------------|----------|
| \`type\` | Item type | \`t-shirt\`, \`blazer\`, \`pleated skirt\`, etc. |
| \`color\` | Color | \`white\`, \`black\`, \`red\`, \`navy\`, \`multicolor\` |
| \`color_scheme\` | Color scheme | \`monochrome\`, \`complementary colors\`, \`pastel colors\` |
| \`material\` | Material | \`silk\`, \`leather\`, \`lace\`, \`denim\`, \`cotton\` |
| \`texture\` | Texture | \`soft\`, \`smooth\`, \`glossy\`, \`matte\`, \`fluffy\` |
| \`pattern\` | Pattern | \`stripes\`, \`plaid\`, \`polka dots\`, \`floral\` |
| \`fit\` | Fit | \`tight\`, \`loose\`, \`oversized\` |
| \`state\` | State | \`wet clothes\`, \`torn clothes\`, \`disheveled clothes\` |
| \`neckline\` | Neckline | \`v-neck\`, \`off-shoulder\`, \`turtleneck\` |
| \`sleeve\` | Sleeve | \`sleeveless\`, \`short sleeve\`, \`long sleeve\` |
| \`length\` | Length | \`mini\`, \`midi\`, \`maxi\`, \`cropped\` |

#### Writing Patterns

\`\`\`yaml
# Simple
outfit:
  top: blazer
  bottom: pleated skirt

# Detailed
outfit:
  top:
    type: blazer
    color: navy
    material: wool
    fit: slim
  bottom:
    type: pleated skirt
    color: gray
    pattern: plaid
    length: mini
\`\`\`

---

## Environment

### environment

**type**: \`object\`

Specifies background and setting.

| Key | Description | Examples |
|-----|-------------|----------|
| \`world\` | World setting | \`fantasy\`, \`sci-fi\`, \`modern\`, \`historical\`, \`cyberpunk\`, \`steampunk\` |
| \`background\` | Background type | \`simple background\`, \`gradient background\`, \`white background\`, \`black background\` |
| \`color\` | Background color/tone | \`gradient\`, \`monochrome\`, \`pastel\`, \`vivid\`, \`warm tones\`, \`cool tones\` |
| \`location\` | Location | \`indoors\`, \`outdoors\`, \`beach\`, \`forest\`, \`city\`, \`castle\`, \`classroom\` |
| \`time\` | Time of day | \`day\`, \`night\`, \`sunset\`, \`dawn\`, \`golden hour\` |
| \`weather\` | Weather | \`sunny\`, \`rain\`, \`snow\`, \`cloudy\`, \`fog\` |
| \`season\` | Season | \`spring (season)\`, \`summer\`, \`autumn\`, \`winter\` |
| \`crowd\` | Crowd | \`crowd\`, \`sparse crowd\`, \`empty\` |
| \`props\` | Background props | \`chair\`, \`table\`, \`flowers\`, \`bookshelf\`, \`lamp\` |

\`\`\`yaml
environment:
  world: fantasy
  location: castle
  time: sunset
  weather: cloudy
  props: [throne, candles]
\`\`\`

> **Note**: \`props\` is for things in the background. Held items go in \`outfit.props\`.

---

## Aesthetic / Mood / Effects - Style

### aesthetic

**type**: \`object\`

Specifies art style.

| Key | Description | Examples |
|-----|-------------|----------|
| \`style\` | Art style | \`anime\`, \`realistic\`, \`painterly\`, \`sketch\`, \`watercolor\`, \`oil painting\`, \`pixel art\`, \`3D render\` |
| \`medium\` | Medium | \`digital art\`, \`traditional\`, \`mixed media\` |
| \`color_scheme\` | Color scheme | \`warm tones\`, \`cool tones\`, \`pastel colors\`, \`vibrant colors\`, \`monochrome\` |

\`\`\`yaml
aesthetic:
  style: anime
  medium: digital art
  color_scheme: pastel colors
\`\`\`

> **Note**: Artist names are not included in the dictionary.

### mood

**type**: \`string\`

Specifies atmosphere and emotional tone.

\`\`\`yaml
mood: joyful      # joyful, melancholic, dramatic, peaceful, serene, tense, eerie
\`\`\`

### effects

**type**: \`array\`

Specifies visual effects.

\`\`\`yaml
effects: [sparkles, bokeh, lens flare, particles, motion blur, chromatic aberration]
\`\`\`

#### Decision Guide

| When in doubt | Classification |
|---------------|----------------|
| "How to draw it" (technique) | \`aesthetic\` |
| "What mood" (atmosphere) | \`mood\` |
| "Effects to add on top" | \`effects\` |

---

## Lighting

### lighting

**type**: \`object\`

Specifies lighting.

| Key | Description | Examples |
|-----|-------------|----------|
| \`base\` | Overall feel | \`professional\`, \`dramatic\`, \`soft\`, \`natural\`, \`studio\`, \`cinematic\` |
| \`source\` | Light source | \`sunlight\`, \`moonlight\`, \`neon light\`, \`candlelight\`, \`window light\` |
| \`technique\` | Technique | \`high-key\`, \`low-key\`, \`Rembrandt\`, \`split lighting\`, \`butterfly lighting\` |
| \`color\` | Color temperature | \`warm\`, \`cool\`, \`golden\`, \`blue hour\` |
| \`shadow\` | Shadow | \`hard shadow\`, \`soft shadow\`, \`no shadow\`, \`rim light\` |

\`\`\`yaml
# Simple (just atmosphere)
lighting:
  base: professional

# Detailed
lighting:
  base: dramatic
  source: window light
  technique: Rembrandt
  shadow: hard shadow
\`\`\`

---

## Composition

### composition

**type**: \`object\`

Specifies composition.

| Key | Description | Examples |
|-----|-------------|----------|
| \`shot\` | Framing | \`full body\`, \`upper body\`, \`close-up\`, \`cowboy shot\`, \`bust shot\` |
| \`angle\` | Camera angle | \`from above\`, \`from below\`, \`eye level\`, \`dutch angle\`, \`from side\` |
| \`method\` | Composition technique | \`rule of thirds\`, \`centered\`, \`symmetrical\`, \`golden ratio\`, \`diagonal\` |

\`\`\`yaml
composition:
  shot: upper body
  angle: from below
  method: rule of thirds
\`\`\`

---

## Photography

### photography

**type**: \`object\`

Specifies photography techniques. Mainly for realistic images.

| Key | Description | Examples |
|-----|-------------|----------|
| \`shot_with\` | Camera equipment | \`shot on DSLR\`, \`shot on mirrorless camera\`, \`shot on 35mm film\`, \`shot on Polaroid\`, \`shot on smartphone\` |
| \`lens\` | Lens | \`24mm wide angle\`, \`200mm telephoto\`, \`fisheye lens\`, \`macro lens\`, \`85mm f/1.4\` |
| \`film\` | Film | \`Kodak Portra 400\`, \`Fuji Pro 400H\`, \`Cinestill 800T\`, \`Kodak Tri-X 400\` |

\`\`\`yaml
photography:
  shot_with: shot on 35mm film
  lens: 85mm f/1.4
  film: Kodak Portra 400
\`\`\`

---

## Quality / Negative

### quality

**type**: \`array\`

Specifies quality enhancement tags.

\`\`\`yaml
quality: [masterpiece, best quality, highly detailed, 4k, 8k, absurdres]
\`\`\`

### negative

**type**: \`array\`

Specifies negative prompt (things to exclude).

\`\`\`yaml
negative: [worst quality, low quality, bad anatomy, extra fingers, bad hands, watermark, blurry, signature]
\`\`\`

---

## Multiple Characters

How to describe 2 or more characters.

### Basic Structure

\`\`\`yaml
subject: 2girls

# Key names are flexible (names work too)
character_1:
  demographics:
    age: young
  appearance:
    hair:
      color: blonde
  pose:
    base: standing
  outfit:
    costume: schoolgirl

character_2:
  demographics:
    age: young
  appearance:
    hair:
      color: teal
  pose:
    base: sitting
  outfit:
    costume: idol

# Interaction
interaction: holding hands, looking at each other
\`\`\`

### interaction Vocabulary

| Category | Examples |
|----------|----------|
| Contact | \`holding hands\`, \`hugging\`, \`kissing\`, \`hand on shoulder\` |
| Position | \`back to back\`, \`facing each other\`, \`side by side\` |
| Action | \`fighting\`, \`dancing together\`, \`playing\` |
| Gaze | \`looking at each other\`, \`whispering\` |

---

## Design Philosophy

### 1. base Pattern (pose, lighting)

For \`pose\` and \`lighting\`, direct string specification and \`base\` key specification are equivalent.

- Simple specification → direct string
- Want to add details → \`base\` key + other keys

\`\`\`yaml
# Direct string (simple)
pose: standing

# Using base key (equivalent)
pose:
  base: standing

# Adding details
pose:
  base: standing
  hands: peace sign
\`\`\`

### 2. outfit Item Detail Specification

When specifying outfit items in detail, use the \`type\` key for item type.
\`type\` is a key exclusive to outfit items.

\`\`\`yaml
# Simple (direct string)
outfit:
  top: t-shirt

# Detailed (using type key)
outfit:
  top:
    type: t-shirt
    color: white
    fit: oversized
\`\`\`

### 3. props Placement

- \`outfit.props\` = Held items (sword, umbrella...)
- \`environment.props\` = Background items (chair, table...)

### 4. ethnicity vs race

- \`ethnicity\` = Real-world ethnicity (japanese, caucasian...)
- \`race\` = Fantasy race (elf, demon, catgirl...)

### 5. facing vs angle

- \`pose.facing\` = Model's direction (facing viewer, looking back...)
- \`composition.angle\` = Camera angle (from above, from behind...)

### 6. Dictionary Vocabulary Selection Criteria

**Include:**
- AI image generation-specific terms
- Specialized terms with unclear effects
- Style and technique-related
- "Can't use if you don't know" type

**Exclude:**
- Common nouns (bus, apple, dog)
- Words anyone would think of
- Artist names
- Too specific combinations

### 7. Model-Specific Tags

Some models require special tags. YAPS doesn't restrict these. You can freely add keys at the top level.

\`\`\`yaml
# Animagine-XL
rating: sensitive          # Content rating
temporal: year 2020        # Era setting

# Pony Diffusion
score_9, score_8_up         # Quality score tags
source_anime               # Source specification
\`\`\`

These are not standard YAPS keys, but adding them to the dictionary enables autocomplete.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2024-12-24 | Initial release |
| v1.1 | 2024-12-28 | Dictionary sync, example value updates, added \`environment.color\` |
| v1.2 | 2024-12-29 | Added \`texture\` key (generic texture attribute for hair, outfit items) |

---

*YAPS - Yet Another Prompt Schema*
`;
