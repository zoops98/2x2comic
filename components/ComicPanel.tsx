
import React from 'react';
import Spinner from './Spinner';
import type { PanelScript } from '../types';

interface ComicPanelProps {
  panel: PanelScript;
  imageData: string | null;
  isLoading: boolean;
  onGenerateImage: () => void;
  isScriptGenerated: boolean;
}

const ComicPanel: React.FC<ComicPanelProps> = ({ panel, imageData, isLoading, onGenerateImage, isScriptGenerated }) => {
  return (
    <div className="aspect-square border-[6px] border-white bg-white rounded-[2rem] shadow-xl flex flex-col justify-between items-center p-6 relative overflow-hidden transition-all hover:shadow-2xl">
      {imageData ? (
        <img src={`data:image/png;base64,${imageData}`} alt={`패널 ${panel.panel} 이미지`} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="text-center w-full flex flex-col justify-between h-full z-10">
          <div className="space-y-4">
            <h3 className="font-black text-xl text-indigo-600 tracking-widest opacity-40 uppercase">Panel 0{panel.panel}</h3>
            {isScriptGenerated ? (
              <div className="text-left w-full space-y-4">
                {panel.dialogue && panel.dialogue !== '없음' ? (
                  <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                    <p className="text-sm text-indigo-900 leading-relaxed font-medium">
                        <span className="font-black text-indigo-600 mr-2">{panel.character}</span>
                        {panel.dialogue}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic p-4 text-center">
                    (이미지 묘사 중심)
                  </p>
                )}
                 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Visual Guide</p>
                    <p className="text-[11px] text-slate-400 leading-tight">{panel.description}</p>
                 </div>
              </div>
            ) : <p className="text-sm text-slate-700 font-medium">{panel.description}</p>
            }
          </div>
          <div className="flex justify-center items-center h-full">
            {isLoading ? (
              <Spinner />
            ) : (
                isScriptGenerated && (
                <button
                    onClick={onGenerateImage}
                    disabled={isLoading}
                    className="mt-6 px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:bg-slate-200 disabled:shadow-none"
                >
                    컷 생성하기
                </button>
                )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComicPanel;
