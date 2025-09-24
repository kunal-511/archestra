import { Download, ExternalLink, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@ui/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@ui/components/ui/dialog';
import { cn } from '@ui/lib/utils/tailwind';

interface ImageDisplayProps {
  src: string;
  alt?: string;
  className?: string;
  showControls?: boolean;
}

export default function ImageDisplay({ src, alt = 'Generated image', className, showControls = true }: ImageDisplayProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [scale, setScale] = useState(1);

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      if (src.startsWith('data:')) {
        // For data URLs, copy the base64 part
        const base64Data = src.split(',')[1];
        await navigator.clipboard.writeText(base64Data);
      } else {
        // For regular URLs, copy the URL
        await navigator.clipboard.writeText(src);
      }
    } catch (error) {
      console.error('Failed to copy image:', error);
    }
  };

  const handleOpenExternal = () => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(src);
    } else {
      window.open(src, '_blank');
    }
  };

  return (
    <>
      <div className={cn('relative group inline-block', className)}>
        <img
          src={src}
          alt={alt}
          className="max-w-full h-auto rounded-lg shadow-sm cursor-pointer transition-opacity hover:opacity-90"
          onClick={() => setIsDialogOpen(true)}
          loading="lazy"
        />

        {showControls && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex gap-1 bg-black/70 rounded-md p-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDialogOpen(true);
                }}
                title="View full size"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
                title="Download image"
              >
                <Download className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenExternal();
                }}
                title="Open in external app"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>Image Viewer</DialogTitle>
            <DialogDescription>{alt}</DialogDescription>
          </DialogHeader>

          <div className="relative overflow-auto p-6 pt-2 flex justify-center">
            <div className="relative">
              <img
                src={src}
                alt={alt}
                className="max-w-full h-auto rounded-lg"
                style={{ transform: `scale(${scale})` }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center p-6 pt-2 border-t">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setScale(Math.max(0.25, scale - 0.25))}
                disabled={scale <= 0.25}
              >
                <ZoomOut className="h-4 w-4 mr-1" />
                Zoom Out
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setScale(1)}
                disabled={scale === 1}
              >
                Reset
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setScale(Math.min(3, scale + 0.25))}
                disabled={scale >= 3}
              >
                <ZoomIn className="h-4 w-4 mr-1" />
                Zoom In
              </Button>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCopyToClipboard}>
                Copy
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}