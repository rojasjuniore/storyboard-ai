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

    // Build the prompt
    const imagePrompt = `Create a storyboard panel illustration. 
Style: ${stylePrompt}

Scene: ${scene.title}
Visual description: ${scene.description}
${scene.vo ? `Dialogue/VO: "${scene.vo}"` : ''}

Requirements:
- Professional storyboard panel
- Clean composition
- Include label at bottom: "SCENE ${parseInt(sceneIndex) + 1} - ${scene.title.toUpperCase()}"
${referenceImages.length > 0 ? '- Use the character from the reference images provided, maintaining exact same appearance' : ''}

Generate a single high-quality storyboard panel image.`;

    // Build request parts
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    
    // Add reference images first
    for (const img of referenceImages) {
      parts.push({
        inlineData: img,
      });
    }
    
    // Add text prompt
    parts.push({ text: imagePrompt });

    // Call Gemini image generation (Imagen 3 via Gemini)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 8192,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      }
    );

    const data = await response.json();
    
    // Check for errors
    if (data.error) {
      console.error('Gemini API error:', JSON.stringify(data.error, null, 2));
      return NextResponse.json({ 
        error: 'Gemini API error',
        details: data.error.message || 'Unknown error'
      }, { status: 500 });
    }

    // Extract image from response (if using imagen model)
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

    // If Gemini Flash doesn't return image, use external image generation
    // Fallback: Use Gemini to create a detailed prompt and generate placeholder
    const textResponse = candidates[0]?.content?.parts?.[0]?.text;
    
    // Try using the dedicated image generation endpoint
    const imageGenResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: imagePrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: "16:9",
            safetyFilterLevel: "block_few",
            personGeneration: "allow_adult",
          },
        }),
      }
    );

    const imageGenData = await imageGenResponse.json();
    
    if (imageGenData.predictions?.[0]?.bytesBase64Encoded) {
      const publicDir = path.join(process.cwd(), 'public', 'generated');
      await mkdir(publicDir, { recursive: true });
      
      const filename = `panel-${sceneIndex}-${Date.now()}.png`;
      const filepath = path.join(publicDir, filename);
      
      const imageBuffer = Buffer.from(imageGenData.predictions[0].bytesBase64Encoded, 'base64');
      await writeFile(filepath, imageBuffer);
      
      return NextResponse.json({ 
        imageUrl: `/generated/${filename}`,
        success: true 
      });
    }

    // Final fallback: return error with details
    console.error('No image generated:', JSON.stringify({ data, imageGenData }, null, 2));
    return NextResponse.json({ 
      error: 'Image generation not available',
      details: 'The model did not return an image. Try using a different style or simplifying the prompt.',
      textResponse,
    }, { status: 500 });
    
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate image',
      details: String(error)
    }, { status: 500 });
  }
}
