import { NextRequest, NextResponse } from 'next/server';

interface Scene {
  id: number;
  time: string;
  title: string;
  description: string;
  vo: string;
  screenText: string;
  imageUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { scenes } = await request.json() as { scenes: Scene[] };
    
    // Generate HTML for the storyboard
    const html = generateStoryboardHTML(scenes);
    
    // For now, return HTML (can be converted to PDF with puppeteer later)
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': 'attachment; filename="storyboard.html"',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}

function generateStoryboardHTML(scenes: Scene[]): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Storyboard Export</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #1a1a2e;
      color: #fff;
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding: 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
    }
    .header h1 { font-size: 2rem; margin-bottom: 8px; }
    .header p { opacity: 0.9; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }
    .panel {
      background: #16213e;
      border-radius: 12px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .panel-image {
      width: 100%;
      aspect-ratio: 16/9;
      object-fit: cover;
      background: #0f0f1a;
    }
    .panel-content {
      padding: 16px;
    }
    .panel-time {
      display: inline-block;
      background: #667eea;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .panel-title {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .panel-description {
      font-size: 14px;
      color: #ccc;
      margin-bottom: 8px;
    }
    .panel-vo {
      font-size: 12px;
      color: #888;
      font-style: italic;
      border-left: 2px solid #667eea;
      padding-left: 8px;
    }
    @media print {
      body { background: white; color: black; }
      .panel { border: 1px solid #ddd; }
      .panel-description { color: #333; }
      .panel-vo { color: #666; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎬 Storyboard</h1>
    <p>${scenes.length} Scenes</p>
  </div>
  
  <div class="grid">
    ${scenes.map(scene => `
      <div class="panel">
        ${scene.imageUrl 
          ? `<img class="panel-image" src="${scene.imageUrl.startsWith('/') ? baseUrl + scene.imageUrl : scene.imageUrl}" alt="${scene.title}" />`
          : `<div class="panel-image" style="display:flex;align-items:center;justify-content:center;color:#666;">No image</div>`
        }
        <div class="panel-content">
          <span class="panel-time">${scene.time}</span>
          <h3 class="panel-title">Scene ${scene.id}: ${scene.title}</h3>
          <p class="panel-description">${scene.description}</p>
          ${scene.vo ? `<p class="panel-vo">VO: "${scene.vo}"</p>` : ''}
        </div>
      </div>
    `).join('')}
  </div>
  
  <script>
    // Auto-print on load (optional)
    // window.onload = () => window.print();
  </script>
</body>
</html>`;
}
