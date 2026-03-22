
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { generateScript, generateImage, generateCharacterSheet, generateIdeas, generateInstagramPost, generateContinuationScript, setDynamicApiKey } from './services/geminiService';
import type { FullScript, Character, Step, StoryFormat, ContinuationType, TailDirection } from './types';
import ComicPanel from './components/ComicPanel';
import Spinner from './components/Spinner';
import { InteractiveComicPanel, type BubbleConfig, drawTextOnImage, getDefaultBubbleConfig } from './components/InteractiveComicPanel';

// Added readonly modifier to fix "identical modifiers" error if it exists globally
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    readonly aistudio: AIStudio;
  }
}

const artStyles = [
  { name: '🧸 명랑만화', value: '명랑만화' },
  { name: '💥 아메리칸 코믹스', value: '아메리칸 코믹스' },
  { name: '✨ 한국 최신 웹툰', value: '한국 최신 웹툰' },
  { name: '🎞️ 린 클레어 (복고풍)', value: '린 클레어 (Ligne claire)' },
  { name: '🎨 정밀 일러스트', value: 'Detailed Illustration' },
  { name: '🏛️ 건축 스케치', value: 'Architectural Sketch' },
  { name: '📐 플랫 벡터 1', value: 'Flat vector 1' },
  { name: '📐 플랫 벡터 2', value: 'Flat Vector 2' },
  { name: '💧 수채화', value: 'Watercolor' },
  { name: '✏️ 목탄화', value: 'Charcoal Sketch' },
  { name: '📸 포토 코믹', value: 'Photo Comic' },
  { name: '👗 패션 일러스트', value: 'Fashion Illustration' },
  { name: '🏙️ 어반 스케치 1', value: 'Urban Sketch 1' },
  { name: '🏙️ 어반 스케치 2', value: 'Urban Sketch 2' },
  { name: '🏙️ 어반 스케치 3', value: 'Urban Sketch 3' },
  { name: '🖋️ 아웃라인', value: 'Outline' },
  { name: '📚 그래픽 노블', value: 'Graphic Novel' },
  { name: '➰ 컨투어 드로잉', value: 'Contour Drawing' },
  { name: '🤪 캐리커처', value: 'Caricature' },
  { name: '🇯🇵 일본 망가', value: 'Japanese Manga' },
  { name: '🇰🇷 한국 웹툰 (클래식)', value: 'Korean Webtoon' },
  { name: '🍃 지브리 스타일', value: 'Ghibli Style' },
  { name: '🏰 디즈니 스타일', value: 'Disney Style' },
  { name: '👤 인물 일러스트', value: 'Person of Illustration' },
  { name: '🚫 선 없는 일러스트', value: 'Lineless Illustration' },
  { name: '🕶️ 애너글리프 3D', value: 'Anaglyph 3D' },
  { name: '🔬 하이퍼 리얼', value: 'Hyper Real' },
];

const textFrameStyles = [
  { id: 'speech-bubble', name: '💬 말풍선 (자유 편집)' },
  { id: 'simple', name: '⬜ 심플 (하단 흰색)' },
  { id: 'webtoon', name: '📱 웹툰 스타일' },
  { id: 'narration', name: '📜 나레이션 (상단)' },
  { id: 'cinematic', name: '🎬 시네마틱 자막' },
];

const StepIndicator: React.FC<{ currentStep: Step }> = ({ currentStep }) => {
    const steps = [
        { id: 'STEP_1_TOPIC', title: '지문 입력' },
        { id: 'STEP_2_SCRIPT', title: '대본 확인' },
        { id: 'STEP_3_CHARACTERS', title: '캐릭터 생성' },
        { id: 'STEP_4_COMIC', title: '만화 완성' }
    ];
    const currentStepIndex = steps.findIndex(s => s.id === currentStep);

    return (
        <div className="flex justify-center items-center my-12 w-full max-w-2xl mx-auto px-4">
            {steps.map((step, index) => (
                <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center relative">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500 z-10 ${index <= currentStepIndex ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)] scale-110' : 'bg-slate-200 text-slate-500'}`}>
                            {index + 1}
                        </div>
                        <span className={`absolute -bottom-8 whitespace-nowrap text-xs font-bold transition-colors duration-500 ${index <= currentStepIndex ? 'text-indigo-700' : 'text-slate-400'}`}>{step.title}</span>
                    </div>
                    {index < steps.length - 1 && (
                        <div className={`flex-1 h-[3px] mx-1 rounded-full transition-colors duration-700 ${index < currentStepIndex ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<string>(localStorage.getItem('GEMINI_API_KEY') || '');
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [topic, setTopic] = useState<string>('');
  const [artStyle, setArtStyle] = useState<string>(artStyles[0].value);
  const [textFrameStyle, setTextFrameStyle] = useState<string>(textFrameStyles[0].id);
  const [script, setScript] = useState<FullScript | null>(null);
  
  const [rawImages, setRawImages] = useState<(string | null)[]>([null, null, null, null]);
  const [finalImages, setFinalImages] = useState<(string | null)[]>([null, null, null, null]);
  const [bubbleConfigs, setBubbleConfigs] = useState<(BubbleConfig | null)[]>([null, null, null, null]);
  
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [isGeneratingSheets, setIsGeneratingSheets] = useState<boolean>(false);
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null);
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState<boolean>(false);
  const [suggestedIdeas, setSuggestedIdeas] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<Step>('STEP_1_TOPIC');
  
  const [storyFormat, setStoryFormat] = useState<StoryFormat>('single');
  const [isGeneratingContinuation, setIsGeneratingContinuation] = useState<boolean>(false);

  const characterImageInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);
  const [regeneratingSheetIndex, setRegeneratingSheetIndex] = useState<number | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      const savedKey = localStorage.getItem('GEMINI_API_KEY');
      if (savedKey) {
        setDynamicApiKey(savedKey);
        setHasApiKey(true);
      } else if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // If no saved key and no aistudio, we might need one
        setHasApiKey(false);
      }
    };
    checkKey();
  }, []);

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('GEMINI_API_KEY', apiKeyInput.trim());
      setDynamicApiKey(apiKeyInput.trim());
      setHasApiKey(true);
      setShowApiKeyModal(false);
      setError(null);
    } else {
      setError('API 키를 입력해주세요.');
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem('GEMINI_API_KEY');
    setDynamicApiKey('');
    setApiKeyInput('');
    setHasApiKey(false);
  };

  const handleConnectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const handleReset = () => {
    setTopic('');
    setScript(null);
    setRawImages([null, null, null, null]);
    setFinalImages([null, null, null, null]);
    setBubbleConfigs([null, null, null, null]);
    setError(null);
    setSuggestedIdeas([]);
    setCurrentStep('STEP_1_TOPIC');
    setStoryFormat('single');
  };

  const handlePanelCharacterChange = useCallback((panelIndex: number, newCharacter: string) => {
    if (!script) return;
    const updatedPanels = script.panels.map((panel, index) => {
        if (index === panelIndex) return { ...panel, character: newCharacter };
        return panel;
    });
    setScript({ ...script, panels: updatedPanels });
    setBubbleConfigs(prev => {
        const newConfigs = [...prev];
        const config = newConfigs[panelIndex];
        if (config) {
            newConfigs[panelIndex] = { ...config, style: newCharacter === '생각' ? 'thought' : 'speech' };
        }
        return newConfigs;
    });
  }, [script]);

  const handleDialogueChange = useCallback((panelIndex: number, newDialogue: string) => {
    if (!script) return;
    const updatedPanels = script.panels.map((panel, index) => {
        if (index === panelIndex) return { ...panel, dialogue: newDialogue };
        return panel;
    });
    setScript({ ...script, panels: updatedPanels });
  }, [script]);

  const handleBubbleConfigChange = useCallback((panelIndex: number, newConfig: BubbleConfig) => {
    setBubbleConfigs(prev => {
      const newConfigs = [...prev];
      newConfigs[panelIndex] = newConfig;
      return newConfigs;
    });
  }, []);

  const handleGenerateIdeas = useCallback(async () => {
    setIsGeneratingIdeas(true);
    setError(null);
    setSuggestedIdeas([]);
    try {
      const ideas = await generateIdeas();
      setSuggestedIdeas(ideas);
    } catch (err) {
      setError('아이디어를 가져오지 못했습니다.');
    } finally {
      setIsGeneratingIdeas(false);
    }
  }, []);

  const handleGenerateScript = useCallback(async () => {
    if (!topic.trim()) {
      setError('지문이나 학습 내용을 입력해주세요.');
      return;
    }
    setIsGeneratingScript(true);
    setError(null);
    try {
      const generatedScript = await generateScript(topic, storyFormat);
      setScript(generatedScript);
      setCurrentStep('STEP_2_SCRIPT');
    } catch (err) {
      if (err instanceof Error && err.message.includes("Requested entity was not found")) {
        setHasApiKey(false);
      }
      setError(err instanceof Error ? err.message : '대본 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGeneratingScript(false);
    }
  }, [topic, storyFormat]);
  
  const handleGenerateCharacterSheets = useCallback(async () => {
    if (!script) return;
    setIsGeneratingSheets(true);
    setError(null);
    try {
        const sheetPromises = script.characters.map(char => 
            generateCharacterSheet(char.description, artStyle)
        );
        const sheetImages = await Promise.all(sheetPromises);
        const updatedCharacters = script.characters.map((char, index) => ({
            ...char,
            sheetImage: sheetImages[index],
        }));
        setScript({ ...script, characters: updatedCharacters });
        setCurrentStep('STEP_3_CHARACTERS');
    } catch (err) {
      if (err instanceof Error && err.message.includes("Requested entity was not found")) {
        setHasApiKey(false);
      }
      setError('캐릭터 생성에 실패했습니다.');
    } finally {
        setIsGeneratingSheets(false);
    }
  }, [script, artStyle]);
  
  const handleRegenerateCharacterSheet = useCallback(async (characterIndex: number) => {
    if (!script) return;
    setRegeneratingSheetIndex(characterIndex);
    try {
        const charToRegenerate = script.characters[characterIndex];
        const newSheetImage = await generateCharacterSheet(charToRegenerate.description, artStyle);
        setScript(prevScript => {
            if (!prevScript) return null;
            const updatedCharacters = prevScript.characters.map((char, index) => 
                index === characterIndex ? { ...char, sheetImage: newSheetImage } : char
            );
            return { ...prevScript, characters: updatedCharacters };
        });
    } catch (err) {
        setError('이미지 재생성 실패');
    } finally {
        setRegeneratingSheetIndex(null);
    }
  }, [script, artStyle]);

  const handleGenerateImage = useCallback(async (panelIndex: number) => {
    if (!script) return;
    setGeneratingImageIndex(panelIndex);
    try {
      const panel = script.panels[panelIndex];
      const rawImageBytes = await generateImage(panel.description, script.characters, artStyle);

      if (textFrameStyle === 'speech-bubble') {
        setRawImages(prev => {
          const newImages = [...prev];
          newImages[panelIndex] = rawImageBytes;
          return newImages;
        });
        const tempImg = new Image();
        tempImg.src = `data:image/png;base64,${rawImageBytes}`;
        tempImg.onload = () => {
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            const defaultConfig = getDefaultBubbleConfig(tempCtx, tempImg.width, tempImg.height, panel);
            if (panel.character === '생각') defaultConfig.style = 'thought';
            setBubbleConfigs(prev => {
                const newConfigs = [...prev];
                newConfigs[panelIndex] = defaultConfig;
                return newConfigs;
            });
          }
        };
      } else {
        const imageWithText = await drawTextOnImage(rawImageBytes, panel, textFrameStyle);
        setFinalImages(prev => {
          const newImages = [...prev];
          newImages[panelIndex] = imageWithText;
          return newImages;
        });
      }
    } catch (err) {
      setError('이미지 생성 실패');
    } finally {
      setGeneratingImageIndex(null);
    }
  }, [script, artStyle, textFrameStyle]);

  const handleGenerateAllImages = useCallback(async () => {
    if (!script) return;
    setIsGeneratingAllImages(true);
    setError(null);
    try {
      const imageGenerationPromises = script.panels.map(panel => 
        generateImage(panel.description, script.characters, artStyle)
      );
      const generatedRawImages = await Promise.all(imageGenerationPromises);

      if (textFrameStyle === 'speech-bubble') {
        setRawImages(generatedRawImages);
        const tempImg = new Image();
        tempImg.src = `data:image/png;base64,${generatedRawImages[0]}`;
        tempImg.onload = () => {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                const newConfigs = script.panels.map(panel => {
                    const defaultConfig = getDefaultBubbleConfig(tempCtx, tempImg.width, tempImg.height, panel);
                    if (panel.character === '생각') defaultConfig.style = 'thought';
                    return defaultConfig;
                });
                setBubbleConfigs(newConfigs);
            }
        };
      } else {
        const processedImages = await Promise.all(
          generatedRawImages.map((rawImg, index) => 
            drawTextOnImage(rawImg, script.panels[index], textFrameStyle)
          )
        );
        setFinalImages(processedImages);
      }
    } catch (err) {
        setError('전체 생성 실패');
    } finally {
        setIsGeneratingAllImages(false);
    }
  }, [script, artStyle, textFrameStyle]);

  const getFinalImagesForDownload = useCallback(async (): Promise<(string | null)[]> => {
    if (textFrameStyle === 'speech-bubble') {
        return await Promise.all(rawImages.map(async (rawImg, index) => {
            if (!rawImg || !script || !bubbleConfigs[index]) return null;
            return await drawTextOnImage(rawImg, script.panels[index], textFrameStyle, bubbleConfigs[index]!);
        }));
    }
    return finalImages;
  }, [rawImages, finalImages, script, bubbleConfigs, textFrameStyle]);
  
  const handleDownload = useCallback(async (layout: 'grid' | 'horizontal' | 'vertical') => {
    const imagesToDownload = await getFinalImagesForDownload();
    if (!imagesToDownload.every(img => img)) { setError("완성되지 않은 컷이 있습니다."); return; }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageElements = await Promise.all(imagesToDownload.map(imgData => {
      return new Promise<HTMLImageElement>(res => {
        const img = new Image(); img.src = `data:image/png;base64,${imgData}`; img.onload = () => res(img);
      });
    }));
    const pw = imageElements[0].width; const ph = imageElements[0].height; const gap = 20;
    if (layout === 'grid') { canvas.width = pw * 2 + gap; canvas.height = ph * 2 + gap; }
    else if (layout === 'horizontal') { canvas.width = pw * 4 + gap * 3; canvas.height = ph; }
    else { canvas.width = pw; canvas.height = ph * 4 + gap * 3; }
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (layout === 'grid') {
      ctx.drawImage(imageElements[0], 0, 0); ctx.drawImage(imageElements[1], pw + gap, 0);
      ctx.drawImage(imageElements[2], 0, ph + gap); ctx.drawImage(imageElements[3], pw + gap, ph + gap);
    } else if (layout === 'horizontal') {
      imageElements.forEach((img, i) => ctx.drawImage(img, i * (pw + gap), 0));
    } else {
      imageElements.forEach((img, i) => ctx.drawImage(img, 0, i * (ph + gap)));
    }
    const link = document.createElement('a'); link.download = `comic-${layout}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  }, [getFinalImagesForDownload]);

  const triggerCharacterImageUpload = (index: number) => {
    setUploadTargetIndex(index); characterImageInputRef.current?.click();
  };

  const onCharacterImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadTargetIndex === null) return;
    const file = event.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            setScript(prev => {
                if (!prev) return null;
                const updated = [...prev.characters];
                updated[uploadTargetIndex] = { ...updated[uploadTargetIndex], sheetImage: base64String };
                return { ...prev, characters: updated };
            });
        };
        reader.readAsDataURL(file);
    }
    setUploadTargetIndex(null);
  };

  if (hasApiKey === null) {
    return <div className="flex items-center justify-center min-h-screen bg-white"><Spinner /></div>;
  }

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 text-center border border-slate-100">
          <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
            <span className="text-4xl">🔑</span>
          </div>
          <h2 className="text-3xl font-title text-indigo-900 mb-4">API 키가 필요합니다</h2>
          <p className="text-slate-500 font-medium mb-10 leading-relaxed">
            만화를 생성하기 위해 <strong>Google Gemini API 키</strong>가 필요합니다.<br/>
            키를 입력하면 브라우저에 안전하게 저장됩니다.
          </p>
          
          <div className="space-y-4 mb-8">
            <input 
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AI Studio에서 발급받은 API 키 입력"
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all text-center font-mono"
            />
            <button 
              onClick={handleSaveApiKey}
              className="w-full py-5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-xl rounded-2xl shadow-lg shadow-indigo-100 btn-modern"
            >
              저장하고 시작하기
            </button>
          </div>

          {window.aistudio && (
            <button 
              onClick={handleConnectKey}
              className="w-full py-3 text-indigo-600 font-bold text-sm hover:underline mb-8"
            >
              AI Studio 계정으로 연결하기
            </button>
          )}

          <div className="mt-4">
            <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-400 text-sm font-bold hover:text-indigo-500 transition-colors"
            >
                API 키 발급받기 ↗
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isBusy = isGeneratingScript || isGeneratingSheets || generatingImageIndex !== null || isGeneratingAllImages || isGeneratingIdeas || isGeneratingContinuation || regeneratingSheetIndex !== null;
  const allImagesGenerated = (rawImages.every(img => img !== null) || finalImages.every(img => img !== null));

  return (
    <div className="container mx-auto p-4 md:p-8 min-h-screen text-slate-800">
      <input type="file" ref={characterImageInputRef} accept="image/*" className="hidden" onChange={onCharacterImageSelected} />

      <header className="text-center mb-16 mt-4 relative">
        <div className="absolute right-0 top-0">
          <button 
            onClick={() => setShowApiKeyModal(true)}
            className="p-3 bg-white rounded-full shadow-md hover:shadow-lg transition-all text-slate-400 hover:text-indigo-600"
            title="API 키 설정"
          >
            <span className="text-xl">⚙️</span>
          </button>
        </div>
        <h1 className="text-5xl md:text-7xl font-title text-indigo-600 mb-4 tracking-tight drop-shadow-sm">
          Zoops의 4컷 만화
        </h1>
        <p className="text-slate-500 text-lg md:text-xl font-semibold opacity-80">
          모의고사 지문을 가장 잘 이해할 수 있는 AI 시각화 학습 도구
        </p>
      </header>
      
      <StepIndicator currentStep={currentStep} />

      <main className="max-w-4xl mx-auto pb-20">
        {error && (
          <div className="my-8 p-5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-center font-bold shadow-sm animate-bounce">
            ⚠️ {error}
          </div>
        )}

        {currentStep === 'STEP_1_TOPIC' && (
            <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 p-8 md:p-12 space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="block text-sm font-black text-slate-500 px-1 uppercase tracking-wider">🎨 그림 스타일</label>
                    <div className="relative">
                        <select value={artStyle} onChange={(e) => setArtStyle(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:bg-white text-slate-700 font-bold appearance-none cursor-pointer transition-all">
                        {artStyles.map(s => <option key={s.value} value={s.value}>{s.name}</option>)}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-sm font-black text-slate-500 px-1 uppercase tracking-wider">📝 자막 디자인</label>
                    <div className="relative">
                        <select value={textFrameStyle} onChange={(e) => setTextFrameStyle(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:bg-white text-slate-700 font-bold appearance-none cursor-pointer transition-all">
                        {textFrameStyles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end px-1">
                    <label className="block text-sm font-black text-slate-500 uppercase tracking-wider">📑 학습 지문 또는 텍스트 입력</label>
                    <button onClick={handleGenerateIdeas} disabled={isBusy} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
                        {isGeneratingIdeas ? <Spinner /> : "✨ 구성 아이디어"}
                    </button>
                  </div>

                  {suggestedIdeas.length > 0 && (
                    <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100 flex flex-wrap gap-2.5 animate-in fade-in slide-in-from-top-2">
                        {suggestedIdeas.map((idea, i) => (
                            <button key={i} onClick={() => setTopic(idea)} className="text-xs font-bold px-4 py-2 bg-white text-indigo-700 rounded-full border border-indigo-100 hover:border-indigo-400 hover:shadow-md transition-all">{idea}</button>
                        ))}
                    </div>
                  )}

                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="여기에 모의고사 지문이나 어려운 텍스트를 붙여넣으세요. AI가 핵심 내용을 파악하여 시각적으로 풀어냅니다."
                    className="w-full p-8 bg-slate-50 border-2 border-slate-50 rounded-[2rem] focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all resize-none min-h-[260px] text-slate-700 text-lg leading-relaxed placeholder:text-slate-300 font-medium"
                    disabled={isBusy}
                  />
                </div>

                <button
                  onClick={handleGenerateScript}
                  disabled={isBusy}
                  className="w-full py-6 bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-black text-2xl rounded-[1.5rem] shadow-xl shadow-indigo-200 btn-modern disabled:grayscale disabled:opacity-50 flex items-center justify-center gap-4"
                >
                  {isGeneratingScript ? <Spinner /> : '🚀 분석 및 대본 생성하기'}
                </button>
            </div>
        )}
        
        {currentStep === 'STEP_2_SCRIPT' && script && (
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-8 md:p-12 space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <h3 className="text-3xl font-title text-indigo-900 text-center">학습 시나리오 검토</h3>
              <div className="grid gap-8">
                {script.panels.map((p, i) => (
                    <div key={i} className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-lg">
                        <div className="flex justify-between items-center mb-6">
                          <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 text-xs font-black rounded-full uppercase tracking-[0.2em] shadow-sm">PANEL 0{p.panel}</span>
                        </div>
                        <div className="space-y-6">
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                <p className="text-xs font-black text-slate-400 uppercase mb-2 tracking-widest">Image Description</p>
                                <p className="text-slate-600 text-sm leading-relaxed italic">{p.description}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Speaker</p>
                                    <input value={p.character} onChange={(e) => handlePanelCharacterChange(i, e.target.value)} className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400 transition-all" placeholder="화자" />
                                </div>
                                <div className="md:col-span-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1">Dialogue</p>
                                    <textarea value={p.dialogue} onChange={(e) => handleDialogueChange(i, e.target.value)} className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-400 transition-all" rows={2} placeholder="대사" />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
              </div>
              <div className="flex flex-col md:flex-row gap-6 pt-6">
                  <button onClick={() => setCurrentStep('STEP_1_TOPIC')} className="flex-1 py-5 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all text-lg btn-modern">지문 수정</button>
                  <button onClick={handleGenerateCharacterSheets} disabled={isBusy} className="flex-[2] py-5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 flex items-center justify-center gap-3 text-lg btn-modern">
                      {isGeneratingSheets ? <Spinner /> : '🎨 캐릭터 일러스트 그리기'}
                  </button>
              </div>
          </div>
        )}

        {currentStep === 'STEP_3_CHARACTERS' && script?.characters && (
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-8 md:p-12 space-y-12 animate-in fade-in zoom-in duration-700">
            <h3 className="text-3xl font-title text-indigo-900 text-center">등장인물 완성</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-12">
              {script.characters.map((char, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="relative w-48 h-48 mb-8 group">
                    <div className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl opacity-0 group-hover:opacity-25 transition-opacity duration-500"></div>
                    {regeneratingSheetIndex === i ? (
                      <div className="w-full h-full bg-slate-50 rounded-full flex items-center justify-center border-4 border-slate-100"><Spinner /></div>
                    ) : (
                      <img src={`data:image/png;base64,${char.sheetImage}`} className="w-full h-full object-cover rounded-full border-[6px] border-white shadow-2xl transition-all duration-500 group-hover:scale-105 group-hover:rotate-2 relative z-10" />
                    )}
                  </div>
                  <h4 className="font-black text-2xl text-slate-800 mb-6">{char.name}</h4>
                  <div className="flex gap-3">
                    <button onClick={() => triggerCharacterImageUpload(i)} className="text-[10px] uppercase font-black tracking-widest px-4 py-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all">Upload</button>
                    <button onClick={() => handleRegenerateCharacterSheet(i)} className="text-[10px] uppercase font-black tracking-widest px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 shadow-md shadow-indigo-100 transition-all">Redraw</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-6 border-t border-slate-50 pt-12">
                <button onClick={handleReset} className="flex-1 py-5 bg-slate-100 text-slate-500 font-bold rounded-2xl btn-modern">다시 시작</button>
                <button onClick={() => setCurrentStep('STEP_4_COMIC')} className="flex-[2] py-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-200 btn-modern text-lg">완성된 만화 렌더링</button>
            </div>
          </div>
        )}

        {currentStep === 'STEP_4_COMIC' && (
            <div className="space-y-12 animate-in fade-in duration-1000">
                <div className="flex justify-center">
                  <button onClick={handleGenerateAllImages} disabled={isBusy || allImagesGenerated} className="px-14 py-6 bg-gradient-to-r from-violet-600 to-indigo-700 text-white font-black text-2xl rounded-3xl shadow-2xl shadow-indigo-200 btn-modern disabled:scale-100 disabled:grayscale">
                      {isGeneratingAllImages ? <><Spinner /><span className="ml-4">4컷 만화 제작 중...</span></> : '✨ 전체 4컷 이미지 생성'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {script?.panels.map((p, i) => (
                        <div key={i} className="group transition-all">
                          {textFrameStyle === 'speech-bubble' && rawImages[i] ? (
                              <InteractiveComicPanel rawImage={rawImages[i]!} panel={p} bubbleConfig={bubbleConfigs[i]!} onBubbleConfigChange={(cfg) => handleBubbleConfigChange(i, cfg)} />
                          ) : (
                              <ComicPanel panel={p} imageData={finalImages[i]} isLoading={generatingImageIndex === i} onGenerateImage={() => handleGenerateImage(i)} isScriptGenerated={true} />
                          )}
                        </div>
                    ))}
                </div>

                {allImagesGenerated && (
                    <div className="bg-white rounded-[3rem] p-12 shadow-2xl shadow-slate-200 border border-slate-100 text-center space-y-10 animate-in slide-in-from-top-6 duration-700">
                        <div className="space-y-3">
                            <h3 className="text-4xl font-title text-indigo-900">학습 만화가 완성되었습니다!</h3>
                            <p className="text-slate-400 font-semibold">이제 저장하여 복습하거나 공유해보세요.</p>
                        </div>
                        <div className="flex justify-center gap-5 flex-wrap">
                            <button onClick={() => handleDownload('grid')} className="px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl btn-modern flex items-center gap-2">🖼️ 바둑판 저장</button>
                            <button onClick={() => handleDownload('vertical')} className="px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl btn-modern flex items-center gap-2">📱 세로형 저장</button>
                            <button onClick={handleReset} className="px-8 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl btn-modern">처음으로</button>
                        </div>
                    </div>
                )}
            </div>
        )}
      </main>

      <footer className="text-center mt-20 pb-16 border-t border-slate-200/60 pt-12">
        <p className="text-slate-400 font-bold tracking-tight mb-3">Developed by <span className="text-indigo-600">Zoops</span></p>
        <p className="text-[11px] text-slate-300 font-bold uppercase tracking-[0.3em]">© 2025 Zoops AI Comic Labs. All Rights Reserved.</p>
      </footer>
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100 animate-in zoom-in duration-300">
            <h2 className="text-2xl font-title text-indigo-900 mb-6 text-center">API 키 설정</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Gemini API Key</label>
                <input 
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="API 키 입력"
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all font-mono"
                />
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowApiKeyModal(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                >
                  취소
                </button>
                <button 
                  onClick={handleSaveApiKey}
                  className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                >
                  저장하기
                </button>
              </div>
              <button 
                onClick={handleClearApiKey}
                className="w-full py-2 text-rose-500 text-xs font-bold hover:underline"
              >
                API 키 삭제 (로그아웃)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
