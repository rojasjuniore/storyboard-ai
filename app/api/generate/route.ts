import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sceneStr = formData.get('scene') as string;
    const stylePrompt = formData.get('stylePrompt') as string || 'warm illustrated style, Pixar 3D animation';
    const sceneIndex = formData.get('sceneIndex') as string;
    
    const scene = JSON.parse(sceneStr);
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    // Collect reference images
    const referenceImages: string[] = [];
    for (let i = 0; i < 5; i++) {
      const ref = formData.get(`ref_${i}`) as File | null;
      if (ref) {
        const bytes = await ref.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        referenceImages.push(base64);
      }
    }

    // Build the prompt
    const imagePrompt = `Create a storyboard panel illustration. 
Style: ${stylePrompt}

Scene: ${scene.title}
Visual description: ${scene.description}
${scene.vo ? `Dialogue/VO: "${scene.vo}"` : ''}

Requirements:
- Professional storyboard panel
- Clean composition
- Label at bottom: "SCENE ${parseInt(sceneIndex) + 1} - ${scene.title.toUpperCase()}"
${referenceImages.length > 0 ? '- Use the character from the reference images provided' : ''}`;

    // Build request parts
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    
    // Add reference images first
    for (const base64 of referenceImages) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64,
        },
      });
    }
    
    // Add text prompt
    parts.push({ text: imagePrompt });

    // Call Gemini image generation
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['image', 'text'],
            responseMimeType: 'image/png',
          },
        }),
      }
    );

    const data = await response.json();
    
    // Extract image from response
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          // Save image to public directory
          const publicDir = path.join(process.cwd(), 'public', 'generated');
          await mkdir(publicDir, { recursive: true });
          
          const filename = `panel-${sceneIndex}-${Date.now()}.png`;
          const filepath = path.join(publicDir, filename);
          
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          await writeFile(filepath, imageBuffer);
          
          return NextResponse.json({ 
            imageUrl: `/generated/${filename}`,
            success: true 
          });
        }
      }
    }

    // If no image generated, return error
    console.error('No image in response:', JSON.stringify(data, null, 2));
    return NextResponse.json({ 
      error: 'Failed to generate image',
      details: data.error || 'No image in response'
    }, { status: 500 });
    
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate image',
      details: String(error)
    }, { status: 500 });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
