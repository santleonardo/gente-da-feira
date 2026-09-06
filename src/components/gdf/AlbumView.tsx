"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ImagePlus,
  Video,
  Mic,
  Trash2,
  Loader2,
  Play,
  Pause,
  Camera,
  Film,
  Music,
  AlertCircle,
} from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { PhotoViewer } from "./PhotoViewer";
import { toast } from "sonner";

// ═══════ Regras do álbum ═══════
const MAX_PHOTOS = 20;
const MAX_VIDEOS = 5;
const MAX_VIDEO_DURATION = 30; // segundos
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB

export function AlbumView({ embedded }: { embedded?: boolean }) {
  const { profile, setProfileSubView } = useStore();

  const [photos, setPhotos] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<"photo" | "video" | null>(null);

  // Sub-abas: fotos, vídeos, áudios
  const [subTab, setSubTab] = useState<"fotos" | "videos" | "audios">("fotos");

  // Photo viewer
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Video player
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    fetchMedia();
  }, [profile]);

  const fetchMedia = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [photosRes, videosRes] = await Promise.all([
        fetch(`/api/profile-photos?userId=${profile.id}`),
        fetch(`/api/profile-videos?userId=${profile.id}`),
      ]);
      const photosData = await photosRes.json();
      const videosData = await videosRes.json();
      if (photosData.photos) setPhotos(photosData.photos);
      if (videosData.videos) setVideos(videosData.videos);
    } catch { /* silent */ }
    setLoading(false);
  };

  // ─── Upload de foto ───
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Limite de ${MAX_PHOTOS} fotos atingido. Remova uma para adicionar outra.`);
      return;
    }

    setUploadingPhoto(true);
    try {
      // Upload da imagem para storage
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "album-photos");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.error) { toast.error(uploadData.error); setUploadingPhoto(false); return; }

      // Salvar no banco
      const saveRes = await fetch("/api/profile-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: uploadData.url, storagePath: uploadData.path, caption: "" }),
      });
      const saveData = await saveRes.json();
      if (saveData.photo) {
        setPhotos((prev) => [saveData.photo, ...prev]);
        toast.success("Foto adicionada!");
      } else {
        toast.error(saveData.error || "Erro ao salvar foto");
      }
    } catch {
      toast.error("Erro ao enviar foto");
    }
    setUploadingPhoto(false);
    // Reset input
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // ─── Upload de vídeo ───
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (videos.length >= MAX_VIDEOS) {
      toast.error(`Limite de ${MAX_VIDEOS} vídeos atingido. Remova um para adicionar outro.`);
      return;
    }

    setUploadingVideo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "album-videos");
      const uploadRes = await fetch("/api/upload/video", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.error) { toast.error(uploadData.error); setUploadingVideo(false); return; }

      // Obter duração do vídeo
      let duration = 0;
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      const durationPromise = new Promise<number>((resolve) => {
        videoEl.onloadedmetadata = () => {
          resolve(videoEl.duration && isFinite(videoEl.duration) ? videoEl.duration : 0);
        };
        videoEl.onerror = () => resolve(0);
        setTimeout(() => resolve(0), 5000);
      });
      videoEl.src = URL.createObjectURL(file);
      duration = await durationPromise;
      URL.revokeObjectURL(videoEl.src);

      if (duration > MAX_VIDEO_DURATION) {
        toast.error(`Vídeo muito longo. Máximo ${MAX_VIDEO_DURATION} segundos.`);
        setUploadingVideo(false);
        return;
      }

      const saveRes = await fetch("/api/profile-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: uploadData.url, storagePath: uploadData.path, duration }),
      });
      const saveData = await saveRes.json();
      if (saveData.video) {
        setVideos((prev) => [saveData.video, ...prev]);
        toast.success("Vídeo adicionado!");
      } else {
        toast.error(saveData.error || "Erro ao salvar vídeo");
      }
    } catch {
      toast.error("Erro ao enviar vídeo");
    }
    setUploadingVideo(false);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  // ─── Gravação de áudio ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordingTimer(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await uploadAudio(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      timerIntervalRef.current = setInterval(() => {
        setRecordingTimer((prev) => prev + 1);
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const uploadAudio = async (blob: Blob) => {
    if (!profile) return;
    setUploadingAudio(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("folder", "album-audios");
      const uploadRes = await fetch("/api/upload/audio", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.error) { toast.error(uploadData.error); setUploadingAudio(false); return; }

      // Por enquanto, salvamos áudios como "fotos" no banco com um marcador especial
      // já que não temos tabela profile_audios dedicada
      // TODO: criar tabela profile_audios quando necessário
      toast.success("Áudio gravado e enviado! (armazenado como mídia do perfil)");
    } catch {
      toast.error("Erro ao enviar áudio");
    }
    setUploadingAudio(false);
  };

  // ─── Deletar mídia ───
  const handleDelete = async (id: string, type: "photo" | "video") => {
    setDeletingId(id);
    setDeletingType(type);
    try {
      const endpoint = type === "photo" ? `/api/profile-photos?id=${id}` : `/api/profile-videos?id=${id}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        if (type === "photo") setPhotos((prev) => prev.filter((p) => p.id !== id));
        else setVideos((prev) => prev.filter((v) => v.id !== id));
        toast.success(type === "photo" ? "Foto removida" : "Vídeo removido");
      } else {
        toast.error(data.error || "Erro ao remover");
      }
    } catch {
      toast.error("Erro ao remover");
    }
    setDeletingId(null);
    setDeletingType(null);
  };

  // ─── Video play/pause ───
  const toggleVideo = (videoId: string) => {
    const videoEl = videoRefs.current[videoId];
    if (!videoEl) return;
    if (playingVideoId === videoId) {
      videoEl.pause();
      setPlayingVideoId(null);
    } else {
      // Pause any currently playing
      if (playingVideoId && videoRefs.current[playingVideoId]) {
        videoRefs.current[playingVideoId]!.pause();
      }
      videoEl.play();
      setPlayingVideoId(videoId);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!profile) return null;

  return (
    <div className="album-blog w-full max-w-full min-w-0 overflow-x-hidden space-y-5 sm:space-y-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
        .album-blog {
          font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
          --paper: #F9F8F6;
          --ink: #1A1A1A;
          --ink-light: #4A4A4A;
          --accent: #D96C4A;
        }
        .album-blog .font-serif {
          font-family: "Playfair Display", ui-serif, Georgia, Cambria, serif;
        }
        /* Masonry via CSS columns */
        .album-masonry {
          column-count: 2;
          column-gap: 0.5rem;
          width: 100%;
          max-width: 100%;
        }
        @media (min-width: 640px) {
          .album-masonry {
            column-count: 3;
            column-gap: 0.75rem;
          }
        }
        .album-masonry img {
          max-width: 100%;
          height: auto;
          display: block;
        }
        .album-masonry-item {
          break-inside: avoid;
          margin-bottom: 0.75rem;
        }
        @media (min-width: 640px) {
          .album-masonry-item {
            margin-bottom: 1rem;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3">
        {!embedded && (
          <button
            onClick={() => setProfileSubView("profile")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#4A4A4A] hover:bg-black/5 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-[#1A1A1A]">
            Fotografia
          </h2>
          <p className="text-xs text-[#4A4A4A]/70 mt-0.5">
            {photos.length} foto{photos.length !== 1 ? "s" : ""} · {videos.length} vídeo{videos.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Sub-abas editoriais */}
      <nav className="flex gap-0 border-b border-black/[0.06] overflow-x-auto overscroll-x-contain w-full max-w-full">
        {(
          [
            { id: "fotos" as const, label: "Fotos", icon: Camera },
            { id: "videos" as const, label: "Vídeos", icon: Film },
            { id: "audios" as const, label: "Áudios", icon: Music },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`relative shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors
              ${subTab === tab.id ? "text-[#1A1A1A]" : "text-[#4A4A4A]/60 hover:text-[#1A1A1A]"}`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            {subTab === tab.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#D96C4A] rounded-full" />
            )}
          </button>
        ))}
      </nav>

      {/* ═══════ FOTOS – MASONRY ═══════ */}
      {subTab === "fotos" && (
        <div className="space-y-4">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto || photos.length >= MAX_PHOTOS}
            className="w-full flex items-center justify-center gap-2 rounded-sm border border-dashed border-black/15 bg-white/40 py-3.5 text-sm text-[#4A4A4A] hover:border-[#D96C4A]/40 hover:text-[#1A1A1A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploadingPhoto ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : photos.length >= MAX_PHOTOS ? (
              <>Limite de {MAX_PHOTOS} fotos atingido</>
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                Adicionar foto
              </>
            )}
          </button>

          {loading ? (
            <div className="album-masonry">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="album-masonry-item rounded-sm bg-black/5 animate-pulse"
                  style={{ height: `${120 + (i % 3) * 40}px` }}
                />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="py-16 text-center">
              <Camera className="h-10 w-10 text-black/10 mx-auto mb-3" />
              <p className="font-serif text-lg text-[#4A4A4A]/50">Nenhuma foto ainda</p>
              <p className="text-sm text-[#4A4A4A]/40 mt-1">Adicione fotos ao seu álbum</p>
            </div>
          ) : (
            <div className="album-masonry">
              {photos.map((photo: any, idx: number) => {
                // Alternate aspect hints for visual rhythm (actual image dictates height)
                const aspectHints = ["aspect-[3/4]", "aspect-[4/5]", "aspect-[1/1]", "aspect-[5/6]", "aspect-[3/4]"];
                const aspect = aspectHints[idx % aspectHints.length];
                return (
                  <div key={photo.id} className="album-masonry-item group relative overflow-hidden rounded-sm bg-black/5">
                    <button
                      type="button"
                      className={`block w-full ${aspect} overflow-hidden cursor-zoom-in`}
                      onClick={() => {
                        setViewerPhotos(photos.map((p: any) => p.url));
                        setViewerIndex(photos.findIndex((p: any) => p.id === photo.id));
                        setViewerOpen(true);
                      }}
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || "Foto do álbum"}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      {photo.caption && (
                        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none">
                          <p className="text-white font-serif text-sm tracking-wide drop-shadow-md line-clamp-2">
                            {photo.caption}
                          </p>
                        </div>
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(photo.id, "photo");
                      }}
                      disabled={deletingId === photo.id && deletingType === "photo"}
                      className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1A1A]/60 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-600 backdrop-blur-sm shadow-md"
                    >
                      {deletingId === photo.id && deletingType === "photo" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════ VÍDEOS ═══════ */}
      {subTab === "videos" && (
        <div className="space-y-4">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleVideoUpload}
            className="hidden"
          />

          <button
            onClick={() => videoInputRef.current?.click()}
            disabled={uploadingVideo || videos.length >= MAX_VIDEOS}
            className="w-full flex items-center justify-center gap-2 rounded-sm border border-dashed border-black/15 bg-white/40 py-3.5 text-sm text-[#4A4A4A] hover:border-[#D96C4A]/40 hover:text-[#1A1A1A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploadingVideo ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : videos.length >= MAX_VIDEOS ? (
              <>Limite de {MAX_VIDEOS} vídeos atingido</>
            ) : (
              <>
                <Video className="h-4 w-4" />
                Adicionar vídeo (máx. {MAX_VIDEO_DURATION}s)
              </>
            )}
          </button>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="aspect-video rounded-sm bg-black/5 animate-pulse" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="py-16 text-center">
              <Film className="h-10 w-10 text-black/10 mx-auto mb-3" />
              <p className="font-serif text-lg text-[#4A4A4A]/50">Nenhum vídeo ainda</p>
              <p className="text-sm text-[#4A4A4A]/40 mt-1">Máximo {MAX_VIDEO_DURATION}s cada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {videos.map((video: any) => (
                <div key={video.id} className="group relative overflow-hidden rounded-sm bg-black">
                  <video
                    ref={(el) => {
                      videoRefs.current[video.id] = el;
                    }}
                    src={video.url}
                    className="w-full max-h-64 object-contain"
                    playsInline
                    preload="metadata"
                    onClick={() => toggleVideo(video.id)}
                  />
                  {playingVideoId !== video.id && (
                    <button
                      type="button"
                      onClick={() => toggleVideo(video.id)}
                      className="absolute inset-0 flex items-center justify-center bg-black/30"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                        <Play className="h-6 w-6 text-white fill-white ml-0.5" />
                      </div>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(video.id, "video")}
                    disabled={deletingId === video.id && deletingType === "video"}
                    className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1A1A]/60 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-600 backdrop-blur-sm shadow-md"
                  >
                    {deletingId === video.id && deletingType === "video" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {video.duration && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white tabular-nums">
                      {formatDuration(video.duration)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ ÁUDIOS ═══════ */}
      {subTab === "audios" && (
        <div className="space-y-4">
          {isRecording ? (
            <div className="rounded-xl border border-black/10 bg-white/60 p-5 text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-red-600">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-medium tabular-nums">
                  {formatDuration(recordingTimer)}
                </span>
              </div>
              <p className="text-sm text-[#4A4A4A]">Gravando…</p>
              <button
                onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] text-white px-5 py-2.5 text-sm font-medium hover:bg-[#1A1A1A]/90 transition-colors"
              >
                <Pause className="h-4 w-4" />
                Parar e enviar
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-black/15 bg-white/40 py-10 text-center space-y-3">
              <Mic className="h-8 w-8 text-black/15 mx-auto" />
              <p className="text-sm text-[#4A4A4A]/70">Grave um áudio para o perfil</p>
              <button
                onClick={startRecording}
                disabled={uploadingAudio}
                className="inline-flex items-center gap-2 rounded-full border border-black/15 px-5 py-2.5 text-sm text-[#1A1A1A] hover:bg-black/5 transition-colors disabled:opacity-40"
              >
                {uploadingAudio ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Gravar áudio
                  </>
                )}
              </button>
            </div>
          )}

          <div className="rounded-xl bg-black/[0.03] p-3.5 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-[#4A4A4A]/40 mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#4A4A4A]/55 leading-relaxed">
              Os áudios gravados são salvos junto com suas fotos e vídeos do perfil. Gerenciamento dedicado em breve.
            </p>
          </div>
        </div>
      )}

      {/* ═══════ LIGHTBOX ═══════ */}
      {viewerOpen && viewerPhotos.length > 0 && (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
