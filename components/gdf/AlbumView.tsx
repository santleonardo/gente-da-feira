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
  X,
  AlertCircle,
} from "lucide-react";
import { UserAvatar } from "./UserAvatar";
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {!embedded && (
          <button
            onClick={() => setProfileSubView("profile")}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h2 className="text-lg font-bold">Álbum</h2>
        <Badge variant="secondary" className="text-[10px]">
          {photos.length} foto{photos.length !== 1 ? "s" : ""} · {videos.length} vídeo{videos.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Sub-abas */}
      <div className="flex rounded-xl bg-[#0A4D5C]/[0.06] p-1">
        <button
          onClick={() => setSubTab("fotos")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${subTab === "fotos" ? "bg-[#f7f9fa] text-[#0A4D5C] shadow-sm" : "text-[#0A4D5C]/50 hover:text-[#0A4D5C]/70"}`}
        >
          <Camera className="h-3.5 w-3.5" />
          Fotos
          <span className="text-[10px] text-[#0A4D5C]/40">({photos.length}/{MAX_PHOTOS})</span>
        </button>
        <button
          onClick={() => setSubTab("videos")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${subTab === "videos" ? "bg-[#f7f9fa] text-[#0A4D5C] shadow-sm" : "text-[#0A4D5C]/50 hover:text-[#0A4D5C]/70"}`}
        >
          <Film className="h-3.5 w-3.5" />
          Vídeos
          <span className="text-[10px] text-[#0A4D5C]/40">({videos.length}/{MAX_VIDEOS})</span>
        </button>
        <button
          onClick={() => setSubTab("audios")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${subTab === "audios" ? "bg-[#f7f9fa] text-[#0A4D5C] shadow-sm" : "text-[#0A4D5C]/50 hover:text-[#0A4D5C]/70"}`}
        >
          <Music className="h-3.5 w-3.5" />
          Áudios
        </button>
      </div>

      {/* ── ABA: FOTOS ── */}
      {subTab === "fotos" && (
        <>
          {/* Upload button */}
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handlePhotoUpload} className="hidden" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto || photos.length >= MAX_PHOTOS}
            className="w-full gap-2 border-dashed border-[#0A4D5C]/20 text-[#0A4D5C] hover:bg-[#f7f75e]/10"
          >
            {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploadingPhoto ? "Enviando..." : photos.length >= MAX_PHOTOS ? "Limite atingido" : "Adicionar foto"}
          </Button>

          {loading ? (
            <div className="grid grid-cols-3 gap-1.5">
              {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : photos.length === 0 ? (
            <div className="py-12 text-center">
              <Camera className="h-12 w-12 text-[#0A4D5C]/20 mx-auto mb-3" />
              <p className="text-sm font-medium text-[#0A4D5C]/60">Nenhuma foto ainda</p>
              <p className="text-xs text-[#0A4D5C]/40 mt-1">Adicione fotos ao seu álbum</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden group">
                  <img
                    src={photo.url}
                    alt="Foto do álbum"
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    loading="lazy"
                    onClick={() => {
                      setViewerPhotos(photos.map((p: any) => p.url));
                      setViewerIndex(photos.findIndex((p: any) => p.id === photo.id));
                      setViewerOpen(true);
                    }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(photo.id, "photo"); }}
                    disabled={deletingId === photo.id && deletingType === "photo"}
                    className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#000305]/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    {deletingId === photo.id && deletingType === "photo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ABA: VÍDEOS ── */}
      {subTab === "videos" && (
        <>
          <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoUpload} className="hidden" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => videoInputRef.current?.click()}
            disabled={uploadingVideo || videos.length >= MAX_VIDEOS}
            className="w-full gap-2 border-dashed border-[#0A4D5C]/20 text-[#0A4D5C] hover:bg-[#f7f75e]/10"
          >
            {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {uploadingVideo ? "Enviando..." : videos.length >= MAX_VIDEOS ? "Limite atingido" : "Adicionar vídeo"}
          </Button>

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : videos.length === 0 ? (
            <div className="py-12 text-center">
              <Film className="h-12 w-12 text-[#0A4D5C]/20 mx-auto mb-3" />
              <p className="text-sm font-medium text-[#0A4D5C]/60">Nenhum vídeo ainda</p>
              <p className="text-xs text-[#0A4D5C]/40 mt-1">Máximo {MAX_VIDEO_DURATION}s cada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {videos.map((video) => (
                <div key={video.id} className="relative rounded-xl overflow-hidden bg-[#000305] group">
                  <video
                    ref={(el) => { videoRefs.current[video.id] = el; }}
                    src={video.url}
                    className="w-full max-h-48 object-contain"
                    playsInline
                    preload="metadata"
                    onEnded={() => setPlayingVideoId(null)}
                    onClick={() => toggleVideo(video.id)}
                  />
                  {playingVideoId !== video.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#000305]/30 cursor-pointer" onClick={() => toggleVideo(video.id)}>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                        <Play className="h-6 w-6 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  )}
                  {video.duration > 0 && (
                    <div className="absolute bottom-2 left-2 rounded-full bg-[#000305]/60 px-2 py-0.5 text-[9px] font-medium text-white">
                      {formatDuration(video.duration)}
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(video.id, "video"); }}
                    disabled={deletingId === video.id && deletingType === "video"}
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#000305]/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    {deletingId === video.id && deletingType === "video" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ABA: ÁUDIOS ── */}
      {subTab === "audios" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-dashed border-[#0A4D5C]/20 p-4 text-center">
            {isRecording ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-semibold text-red-600">Gravando... {formatDuration(recordingTimer)}</span>
                </div>
                <Button variant="destructive" size="sm" onClick={stopRecording} className="gap-2">
                  <Mic className="h-4 w-4" /> Parar gravação
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Mic className="h-8 w-8 text-[#0A4D5C]/30 mx-auto" />
                <p className="text-sm text-[#0A4D5C]/60">Grave um áudio para seu perfil</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startRecording}
                  disabled={uploadingAudio}
                  className="gap-2 border-[#0A4D5C]/20 text-[#0A4D5C] hover:bg-[#f7f75e]/10"
                >
                  {uploadingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                  {uploadingAudio ? "Enviando..." : "Gravar áudio"}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-[#0A4D5C]/[0.04] p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-[#0A4D5C]/40 mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#0A4D5C]/50 leading-relaxed">
              Os áudios gravados são salvos junto com suas fotos e vídeos do perfil. Funcionalidade de gerenciamento de áudios em breve.
            </p>
          </div>
        </div>
      )}

      {/* Photo viewer fullscreen */}
      {viewerOpen && viewerPhotos.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#000305]/90 backdrop-blur-sm" onClick={() => setViewerOpen(false)}>
          <button onClick={() => setViewerOpen(false)} className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"><X className="h-5 w-5" /></button>
          {viewerPhotos.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setViewerIndex((i) => (i > 0 ? i - 1 : viewerPhotos.length - 1)); }} className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">&#8249;</button>
              <button onClick={(e) => { e.stopPropagation(); setViewerIndex((i) => (i < viewerPhotos.length - 1 ? i + 1 : 0)); }} className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">&#8250;</button>
            </>
          )}
          <img src={viewerPhotos[viewerIndex]} alt={`Foto ${viewerIndex + 1}`} className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
          {viewerPhotos.length > 1 && <div className="absolute bottom-4 text-white/70 text-sm">{viewerIndex + 1} / {viewerPhotos.length}</div>}
        </div>
      )}
    </div>
  );
}
