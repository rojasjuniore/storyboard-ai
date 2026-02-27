import { NextRequest, NextResponse } from 'next/server';

interface Scene {
  time: string;
  title: string;
  description: string;
  vo: string;
  screenText: string;
}

export async function POST(request: NextRequest) {
  try {
    const { script } = await request.json();

    // Use AI to parse the script into scenes
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      // Fallback: basic regex parsing
      return NextResponse.json({ scenes: parseScriptBasic(script) });
    }

    const prompt = `Parse this video script into individual scenes. For each scene, extract:
- time: the timestamp range (e.g., "0:00-0:05")
- title: a short title for the scene
- description: the visual description
- vo: the voiceover/narration text (if any)
- screenText: any on-screen text (if any)

Return ONLY a JSON array of scenes, no other text. Example format:
[{"time": "0:00-0:05", "title": "Opening", "description": "Sunrise over house", "vo": "Welcome", "screenText": "Title"}]

Script:
${script}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const scenes = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ scenes });
    }

    // Fallback to basic parsing
    return NextResponse.json({ scenes: parseScriptBasic(script) });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json({ error: 'Failed to parse script' }, { status: 500 });
  }
}

function parseScriptBasic(script: string): Scene[] {
  const scenes: Scene[] = [];
  const lines = script.split('\n');
  
  let currentScene: Partial<Scene> | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match timestamp patterns like "0:00-0:05" or "0:00–0:05"
    const timeMatch = trimmed.match(/^(\d+:\d+[-–]\d+:\d+)\s*[-–—]\s*(.+)/i);
    if (timeMatch) {
      if (currentScene) {
        scenes.push(currentScene as Scene);
      }
      currentScene = {
        time: timeMatch[1],
        title: timeMatch[2],
        description: '',
        vo: '',
        screenText: '',
      };
      continue;
    }
    
    if (currentScene) {
      // Match visual description
      if (trimmed.toLowerCase().startsWith('visual:')) {
        currentScene.description = trimmed.replace(/^visual:\s*/i, '');
      }
      // Match VO
      else if (trimmed.toLowerCase().startsWith('vo:') || trimmed.toLowerCase().startsWith('vo (')) {
        currentScene.vo = trimmed.replace(/^vo[^:]*:\s*/i, '').replace(/^["']|["']$/g, '');
      }
      // Match screen text
      else if (trimmed.toLowerCase().includes('screen text:') || trimmed.toLowerCase().includes('on-screen:')) {
        currentScene.screenText = trimmed.replace(/^.*(?:screen text|on-screen):\s*/i, '');
      }
      // Append to description if it's a bullet point
      else if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        if (!currentScene.description) {
          currentScene.description = trimmed.replace(/^[•\-*]\s*/, '');
        }
      }
    }
  }
  
  if (currentScene) {
    scenes.push(currentScene as Scene);
  }
  
  return scenes;
}
