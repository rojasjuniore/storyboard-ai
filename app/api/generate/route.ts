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

    // Collect reference images as base64
    const referenceImages: { mimeType: string; data: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const ref = formData.get(`ref_${i}`) as File | null;
      if (ref) {
        const bytes = await ref.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        referenceImages.push({
          mimeType: ref.type || 'image/png',
          data: base64,
        });
      }
    }

    // Build the image generation prompt
    const imagePrompt = `Generate a storyboard panel illustration.

Style: ${stylePrompt}

Scene: ${scene.title}
Visual: ${scene.description}
${scene.vo ? `Dialogue: "${scene.vo}"` : ''}

Create a professional storyboard panel with label "SCENE ${parseInt(sceneIndex) + 1} - ${scene.title.toUpperCase()}" at the bottom.
${referenceImages.length > 0 ? 'Use the exact character from the reference images.' : ''}`;

    // Build request parts for Gemini 2.0 Flash with image generation
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    
    // Add reference images
    for (const img of referenceImages) {
      parts.push({ inlineData: img });
    }
    
    // Add prompt
    parts.push({ text: imagePrompt });

    // Try Gemini 2.0 Flash Experimental (supports image generation)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      }
    );

    const data = await response.json();
    console.log('Gemini response:', JSON.stringify(data, null, 2).substring(0, 1000));
    
    // Check for image in response
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.data) {
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

    // Check for error
    if (data.error) {
      console.error('Gemini error:', data.error);
      return NextResponse.json({ 
        error: data.error.message || 'API error',
        details: 'Gemini image generation failed'
      }, { status: 500 });
    }

    // No image generated
    return NextResponse.json({ 
      error: 'No image generated',
      details: 'The API did not return an image. This model may not support image generation.',
      debug: data.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 200)
    }, { status: 500 });
    
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json({ 
      error: 'Generation failed',
      details: String(error)
    }, { status: 500 });
  }
}
