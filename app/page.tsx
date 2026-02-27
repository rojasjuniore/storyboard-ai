'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

interface Scene {
  id: number;
  time: string;
  title: string;
  description: string;
  vo: string;
  screenText: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'done' | 'error';
}

export default function Home() {
  const [script, setScript] = useState('');
  const [characterRefs, setCharacterRefs] = useState<File[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<'input' | 'scenes' | 'generate' | 'preview'>('input');
  const [stylePrompt, setStylePrompt] = useState('warm illustrated style, soft colors, Pixar-like 3D animation');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setCharacterRefs(Array.from(e.target.files));
    }
  };

  const parseScript = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      const data = await response.json();
      setScenes(data.scenes.map((s: Omit<Scene, 'status'>, i: number) => ({ 
        ...s, 
        id: i + 1, 
        status: 'pending' as const 
      })));
      setStep('scenes');
    } catch (error) {
      console.error('Parse error:', error);
    }
    setIsProcessing(false);
  };

  const generateImages = async () => {
    setStep('generate');
    setIsProcessing(true);
    
    const formData = new FormData();
    formData.append('scenes', JSON.stringify(scenes));
    formData.append('stylePrompt', stylePrompt);
    characterRefs.forEach((file, i) => {
      formData.append(`ref_${i}`, file);
    });

    for (let i = 0; i < scenes.length; i++) {
      setScenes(prev => prev.map((s, idx) => 
        idx === i ? { ...s, status: 'generating' } : s
      ));
      setProgress(((i + 1) / scenes.length) * 100);

      try {
        const sceneFormData = new FormData();
        sceneFormData.append('scene', JSON.stringify(scenes[i]));
        sceneFormData.append('stylePrompt', stylePrompt);
        sceneFormData.append('sceneIndex', i.toString());
        characterRefs.forEach((file, j) => {
          sceneFormData.append(`ref_${j}`, file);
        });

        const response = await fetch('/api/generate', {
          method: 'POST',
          body: sceneFormData,
        });
        
        const data = await response.json();
        
        setScenes(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'done', imageUrl: data.imageUrl } : s
        ));
      } catch (error) {
        console.error(`Error generating scene ${i + 1}:`, error);
        setScenes(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'error' } : s
        ));
      }
    }
    
    setIsProcessing(false);
    setStep('preview');
  };

  const exportPDF = async () => {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenes }),
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'storyboard.pdf';
    a.click();
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-xl">
              🎬
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">StoryboardAI</h1>
              <p className="text-xs text-white/60">Script to Storyboard in minutes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/60">
            <span className={step === 'input' ? 'text-purple-400' : ''}>1. Script</span>
            <span>→</span>
            <span className={step === 'scenes' ? 'text-purple-400' : ''}>2. Scenes</span>
            <span>→</span>
            <span className={step === 'generate' ? 'text-purple-400' : ''}>3. Generate</span>
            <span>→</span>
            <span className={step === 'preview' ? 'text-purple-400' : ''}>4. Export</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Step 1: Input */}
        {step === 'input' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="bg-white/5 border-white/10 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">📝 Paste Your Script</h2>
                <Textarea
                  placeholder="Paste your video script here...

Example format:
0:00-0:05 — Opening
Visual: Sunrise illuminating a house silhouette
VO: 'Welcome to your journey'
Screen text: Welcome

0:05-0:15 — Introduction
Visual: Character appears and waves
VO: 'Let me show you around'
..."
                  className="min-h-[400px] bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-white/5 border-white/10 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">🎨 Character References</h2>
                <p className="text-sm text-white/60 mb-4">
                  Upload images of your character for consistent generation
                </p>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="bg-white/5 border-white/10 text-white file:bg-purple-600 file:text-white file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3"
                />
                {characterRefs.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {characterRefs.map((file, i) => (
                      <div key={i} className="w-16 h-16 rounded-lg bg-white/10 overflow-hidden">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Ref ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="bg-white/5 border-white/10 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">🖼️ Visual Style</h2>
                <Textarea
                  placeholder="Describe the visual style..."
                  className="min-h-[100px] bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  value={stylePrompt}
                  onChange={(e) => setStylePrompt(e.target.value)}
                />
              </Card>

              <Button
                onClick={parseScript}
                disabled={!script.trim() || isProcessing}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold py-6"
              >
                {isProcessing ? 'Parsing...' : 'Parse Script →'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Scenes Review */}
        {step === 'scenes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Scene Breakdown</h2>
                <p className="text-white/60">{scenes.length} scenes detected</p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep('input')}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  ← Back
                </Button>
                <Button
                  onClick={generateImages}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold"
                >
                  Generate Images →
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene, i) => (
                <Card key={i} className="bg-white/5 border-white/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-purple-400">{scene.time}</span>
                    <span className="text-xs text-white/40">Scene {scene.id}</span>
                  </div>
                  <h3 className="text-white font-semibold mb-2">{scene.title}</h3>
                  <p className="text-sm text-white/70 mb-2">{scene.description}</p>
                  {scene.vo && (
                    <p className="text-xs text-white/50 italic border-l-2 border-purple-500 pl-2">
                      "{scene.vo}"
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Generating */}
        {step === 'generate' && (
          <div className="max-w-2xl mx-auto text-center space-y-8 py-12">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-4xl animate-pulse">
              🎨
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Generating Storyboard</h2>
              <p className="text-white/60">Creating {scenes.length} panels with AI...</p>
            </div>
            <div className="space-y-2">
              <Progress value={progress} className="h-2 bg-white/10" />
              <p className="text-sm text-white/60">{Math.round(progress)}% complete</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {scenes.map((scene, i) => (
                <div
                  key={i}
                  className={`aspect-video rounded-lg flex items-center justify-center text-2xl ${
                    scene.status === 'done'
                      ? 'bg-green-500/20 border border-green-500/50'
                      : scene.status === 'generating'
                      ? 'bg-purple-500/20 border border-purple-500/50 animate-pulse'
                      : scene.status === 'error'
                      ? 'bg-red-500/20 border border-red-500/50'
                      : 'bg-white/5 border border-white/10'
                  }`}
                >
                  {scene.status === 'done' && '✓'}
                  {scene.status === 'generating' && '⏳'}
                  {scene.status === 'error' && '✗'}
                  {scene.status === 'pending' && i + 1}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {step === 'preview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Storyboard Preview</h2>
                <p className="text-white/60">{scenes.filter(s => s.status === 'done').length} panels generated</p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep('scenes')}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  ← Regenerate
                </Button>
                <Button
                  onClick={exportPDF}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold"
                >
                  📥 Export PDF
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {scenes.map((scene, i) => (
                <Card key={i} className="bg-white/5 border-white/10 overflow-hidden">
                  <div className="aspect-video bg-black/50 relative">
                    {scene.imageUrl ? (
                      <img
                        src={scene.imageUrl}
                        alt={scene.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/40">
                        {scene.status === 'error' ? 'Generation failed' : 'No image'}
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {scene.time}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="text-white font-semibold mb-1">Scene {scene.id}: {scene.title}</h3>
                    <p className="text-sm text-white/70 mb-2">{scene.description}</p>
                    {scene.vo && (
                      <p className="text-xs text-white/50 italic">VO: "{scene.vo}"</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
