import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  volume?: number;
  fadeDuration?: number;
};

export default function SoundOnScroll({
  src,
  volume = 0.7,
  fadeDuration = 800,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const rampIntervalRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);

  // helper to ramp HTMLAudioElement.volume (fallback) smoothly
  const fadeVolumeElement = (from: number, to: number, ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (rampIntervalRef.current) {
      window.clearInterval(rampIntervalRef.current);
      rampIntervalRef.current = null;
    }
    const steps = Math.max(8, Math.round(ms / 50));
    const stepTime = ms / steps;
    let step = 0;
    audio.volume = from;
    rampIntervalRef.current = window.setInterval(() => {
      step++;
      const v = from + (to - from) * (step / steps);
      audio.volume = Math.max(0, Math.min(1, v));
      if (step >= steps) {
        if (rampIntervalRef.current) {
          window.clearInterval(rampIntervalRef.current);
          rampIntervalRef.current = null;
        }
      }
    }, stepTime);
  };

  // helper to ramp GainNode if using WebAudio
  const rampGainNode = (to: number, ms: number) => {
    const gain = gainRef.current;
    const ctx = audioCtxRef.current;
    if (!gain || !ctx) return;
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(to, now + ms / 1000);
    } catch (e) {
      // ignore if something goes wrong, fallback handled elsewhere
    }
  };

  useEffect(() => {
    // create audio element
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audioRef.current = audio;

    // try immediate play (may be blocked)
    (async () => {
      try {
        await audio.play();
        // success
        setIsPlaying(true);
        fadeVolumeElement(0, volume, fadeDuration);
      } catch (err) {
        // autoplay blocked: wait for scroll/touch/keydown
        console.debug("Autoplay blocked, will wait for user interaction", err);
        setNeedsInteraction(true);
      }
    })();

    // attempt play on first user gesture (scroll/touch/keydown)
    const onUserGesture = async () => {
      if (isPlaying) return;
      try {
        // try direct HTMLAudioElement play
        await audio.play();
        setIsPlaying(true);
        setNeedsInteraction(false);
        fadeVolumeElement(0, volume, fadeDuration);
        removeListeners();
      } catch (err) {
        // if still blocked, try WebAudio approach (sometimes helps)
        try {
          if (!audioCtxRef.current) {
            const AC =
              (window as any).AudioContext ||
              (window as any).webkitAudioContext;
            const audioContext = new AC();
            audioCtxRef.current = audioContext;
            const srcNode = audioContext.createMediaElementSource(audio);
            const gainNode = audioContext.createGain();
            gainRef.current = gainNode;
            gainNode.gain.value = 0;
            srcNode.connect(gainNode).connect(audioContext.destination);
          }

          // Add null check here
          const audioContext = audioCtxRef.current;
          if (!audioContext) return;

          await audioContext.resume();
          await audio.play();
          setIsPlaying(true);
          setNeedsInteraction(false);
          rampGainNode(volume, fadeDuration);
          removeListeners();
        } catch (err2) {
          console.warn("Playback still blocked after gesture.", err2);
          setNeedsInteraction(true);
        }
      }
    };

    const events = ["wheel", "touchstart", "scroll", "keydown"];
    const addListeners = () =>
      events.forEach((ev) =>
        window.addEventListener(ev, onUserGesture, { passive: true })
      );
    const remove = () =>
      events.forEach((ev) => window.removeEventListener(ev, onUserGesture));
    const removeListeners = remove; // local alias for inner use

    addListeners();

    // cleanup on unmount
    return () => {
      removeListeners();
      if (rampIntervalRef.current) {
        window.clearInterval(rampIntervalRef.current);
        rampIntervalRef.current = null;
      }
      try {
        audio.pause();
        audio.src = "";
      } catch {}
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch {}
        audioCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]); // re-run only when src changes

  // explicit "Enable sound" button handler (overlay)
  const handleEnableClick = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      // try HTML5 play
      await audio.play();
      setIsPlaying(true);
      setNeedsInteraction(false);
      fadeVolumeElement(0, volume, 400);
    } catch (err) {
      // try WebAudio fallback
      try {
        if (!audioCtxRef.current) {
          const AC =
            (window as any).AudioContext || (window as any).webkitAudioContext;
          const audioContext = new AC();
          audioCtxRef.current = audioContext;
          const srcNode = audioContext.createMediaElementSource(audio);
          const gainNode = audioContext.createGain();
          gainRef.current = gainNode;
          gainNode.gain.value = 0;
          srcNode.connect(gainNode).connect(audioContext.destination);
        }

        // Add null check here
        const audioContext = audioCtxRef.current;
        if (!audioContext) return;

        await audioContext.resume();
        await audio.play();
        setIsPlaying(true);
        setNeedsInteraction(false);
        rampGainNode(volume, 400);
      } catch (err2) {
        console.error("Unable to start audio", err2);
      }
    }
  };

  return (
    <>
      {/* Full-screen overlay that appears when sound needs user interaction */}
      {!isPlaying && needsInteraction && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontFamily: "Arial, sans-serif",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={handleEnableClick}
          role='button'
          aria-label='Press anywhere to start'
        >
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              maxWidth: "80%",
            }}
          >
            <h1
              style={{
                fontSize: "1.5rem",
                marginBottom: "1rem",
                fontWeight: "bold",
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              Press anywhere to start
            </h1>
            <p
              style={{
                fontSize: "1rem",
                opacity: 0.9,
                lineHeight: 1.5,
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              Click, tap, or press any key to begin the experience.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
