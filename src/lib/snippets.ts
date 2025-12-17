export interface Snippet {
  id: string;
  category: string;
  key: string;
  label: string;
  description?: string;
  content: string;
  isBlock: boolean; // true = 複数行ブロック, false = 単一値
}

export const snippets: Snippet[] = [
  // Pose - Block snippets
  {
    id: 'pose_standing',
    category: 'pose',
    key: 'pose',
    label: 'standing (基本)',
    description: '基本の立ちポーズ',
    isBlock: true,
    content: `base: standing
direction: frontal
body:
  torso: straight, relaxed
  arms: at sides
  legs: together`,
  },
  {
    id: 'pose_sitting',
    category: 'pose',
    key: 'pose',
    label: 'sitting (座り)',
    description: '座りポーズ',
    isBlock: true,
    content: `base: sitting
body:
  torso: slightly leaning
  arms: hands on lap
  legs: crossed`,
  },
  {
    id: 'pose_walking',
    category: 'pose',
    key: 'pose',
    label: 'walking (歩行)',
    description: '歩行中のポーズ',
    isBlock: true,
    content: `base: walking
direction: three-quarter
body:
  torso: natural motion
  arms: swinging naturally
  legs: mid-stride`,
  },

  // Pose/Direction - Value snippets
  {
    id: 'pose_direction_profile',
    category: 'pose/direction',
    key: 'direction',
    label: 'profile (横向き)',
    isBlock: false,
    content: 'profile (side view)',
  },
  {
    id: 'pose_direction_threequarter',
    category: 'pose/direction',
    key: 'direction',
    label: 'three-quarter',
    isBlock: false,
    content: 'three-quarter view',
  },
  {
    id: 'pose_direction_frontal',
    category: 'pose/direction',
    key: 'direction',
    label: 'frontal (正面)',
    isBlock: false,
    content: 'frontal',
  },
  {
    id: 'pose_direction_back',
    category: 'pose/direction',
    key: 'direction',
    label: 'back turned',
    isBlock: false,
    content: 'back turned, looking over shoulder',
  },

  // Lighting - Block snippets
  {
    id: 'lighting_lowkey',
    category: 'lighting',
    key: 'lighting',
    label: 'low-key (暗め)',
    description: '暗めのドラマチック照明',
    isBlock: true,
    content: `key: low-key
type: directional diffused soft light
direction: side
shadow:
  quality: soft, present
  depth: deep
color: cool white`,
  },
  {
    id: 'lighting_highkey',
    category: 'lighting',
    key: 'lighting',
    label: 'high-key (明るめ)',
    description: '明るいフラット照明',
    isBlock: true,
    content: `key: high-key
type: soft diffused light
direction: front
shadow:
  quality: minimal
  depth: shallow
color: warm white`,
  },

  // Expression - Block snippets
  {
    id: 'expr_neutral',
    category: 'expression',
    key: 'expression',
    label: 'neutral cool',
    description: '無表情でクール',
    isBlock: true,
    content: `type: neutral cool
eyes:
  direction: forward
  quality: calm, distant
mouth: closed, relaxed`,
  },
  {
    id: 'expr_thoughtful',
    category: 'expression',
    key: 'expression',
    label: 'thoughtful (思索的)',
    description: '思索的な表情',
    isBlock: true,
    content: `type: thoughtful
eyes:
  direction: slightly averted
  quality: focused but soft
mouth: slightly parted`,
  },
];

// カテゴリでグループ化
export function getSnippetsByCategory(): Map<string, Snippet[]> {
  const grouped = new Map<string, Snippet[]>();

  for (const snippet of snippets) {
    const category = snippet.category.split('/')[0]; // トップレベルカテゴリ
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(snippet);
  }

  return grouped;
}

// コンテキストに応じたスニペットを取得
export function getSnippetsForContext(context: string): Snippet[] {
  return snippets.filter(
    (s) => s.key === context || s.category.startsWith(context)
  );
}
