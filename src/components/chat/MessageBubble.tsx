import React from 'react';
import { Check, CheckCheck, Clock, Bot, User, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UIMessage, MessageDirection } from '@/types';

interface MessageBubbleProps {
  msg: UIMessage;
  isMobile: boolean;
  renderMessageContent: (msg: UIMessage) => React.ReactNode;
}

/**
 * Memoized message bubble component to prevent unnecessary re-renders
 * Only re-renders when message id, status, or content changes
 */
export const MessageBubble = React.memo<MessageBubbleProps>(({ 
  msg, 
  isMobile, 
  renderMessageContent 
}) => {
  const isOutgoing = msg.direction === MessageDirection.OUTGOING;

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`flex flex-col ${isMobile ? 'max-w-[85%]' : 'max-w-[75%]'} ${isOutgoing ? 'items-end' : 'items-start'}`}>
        <div 
          className={`${isMobile ? 'px-3 py-2' : 'px-5 py-3'} rounded-2xl shadow-md relative ${isMobile ? 'text-[15px]' : 'text-sm'} leading-relaxed ${
            isOutgoing 
              ? msg.fromType === 'nina'
                ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-tr-sm shadow-violet-900/20'
                : 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white rounded-tr-sm shadow-cyan-900/20'
              : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50'
          }`}
        >
          {/* Show operator name above message for human messages */}
          {msg.fromType === 'human' && msg.senderName && (
            <div className="text-xs font-bold text-cyan-200/80 mb-1.5 uppercase tracking-wide">
              {msg.senderName}:
            </div>
          )}
          {renderMessageContent(msg)}
        </div>
        
        <div className="flex items-center mt-1.5 gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity px-1">
          {isOutgoing && msg.fromType === 'nina' && (
            <Bot className="w-3 h-3 text-violet-400" />
          )}
          {isOutgoing && msg.fromType === 'human' && (
            <User className="w-3 h-3 text-cyan-400" />
          )}
          <span className="text-[10px] text-slate-500 font-medium">{msg.timestamp}</span>
          {isOutgoing && (
            msg.status === 'failed' ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center cursor-help">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="text-xs">
                      <p className="font-semibold text-red-400">Mensagem não entregue</p>
                      {msg.metadata?.whatsapp_error ? (
                        <>
                          <p className="text-slate-300 mt-1">
                            Código: {msg.metadata.whatsapp_error.code}
                          </p>
                          <p className="text-slate-400 mt-0.5 break-words">
                            {msg.metadata.whatsapp_error.title || msg.metadata.whatsapp_error.message}
                          </p>
                        </>
                      ) : (
                        <p className="text-slate-400 mt-1">Erro desconhecido</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) :
            msg.status === 'processing' ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center cursor-help">
                      <Clock className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <span className="text-xs">Processando...</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) :
            msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-cyan-500" /> : 
            msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-slate-500" /> :
            <Check className="w-3.5 h-3.5 text-slate-500" />
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function - only re-render if these change
  return (
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.status === nextProps.msg.status &&
    prevProps.msg.content === nextProps.msg.content &&
    prevProps.isMobile === nextProps.isMobile
  );
});

MessageBubble.displayName = 'MessageBubble';
