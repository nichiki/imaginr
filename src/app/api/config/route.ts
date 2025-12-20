// ComfyUI settings API - file-based storage
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'data', 'config');
const COMFYUI_CONFIG_PATH = path.join(CONFIG_DIR, 'comfyui.json');

export interface NodeOverride {
  nodeId: string;
  property: string;
  value: number | string;
}

export interface WorkflowConfig {
  id: string;
  file: string;
  name: string;
  promptNodeId: string;
  samplerNodeId: string;
  overrides: NodeOverride[];
}

export interface ComfyUISettings {
  enabled: boolean;
  url: string;
  activeWorkflowId: string;
  workflows: WorkflowConfig[];
}

const defaultSettings: ComfyUISettings = {
  enabled: false,
  url: 'http://localhost:8188',
  activeWorkflowId: '',
  workflows: [],
};

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadSettings(): ComfyUISettings {
  ensureConfigDir();

  if (!fs.existsSync(COMFYUI_CONFIG_PATH)) {
    return defaultSettings;
  }

  try {
    const content = fs.readFileSync(COMFYUI_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return { ...defaultSettings, ...parsed };
  } catch (error) {
    console.error('Failed to load ComfyUI settings:', error);
    return defaultSettings;
  }
}

function saveSettings(settings: ComfyUISettings): void {
  ensureConfigDir();
  fs.writeFileSync(COMFYUI_CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

// GET /api/config - Get current settings
export async function GET() {
  try {
    const settings = loadSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to get settings:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

// PUT /api/config - Update settings
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const currentSettings = loadSettings();
    const newSettings = { ...currentSettings, ...body };
    saveSettings(newSettings);
    return NextResponse.json(newSettings);
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
