import type { Genome } from "../core/types";
import { buildCreature } from "../genome/genome";
import { el, clear } from "./dom";
import { creatureCard } from "./creatureCard";
import { initAudio, sfxAbility } from "./sound";

export function playSpliceSequence(
  container: HTMLElement,
  parentA: Genome,
  parentB: Genome,
  child: Genome,
  onConfirm: () => void
): void {
  // Skip overlay in E2E automation
  if (navigator.webdriver) {
    onConfirm();
    return;
  }

  initAudio();
  
  const creatureA = buildCreature(parentA);
  const creatureB = buildCreature(parentB);
  const creatureChild = buildCreature(child);
  
  // Create overlay
  const overlay = el("div", { id: "splice-sequence-overlay" }) as HTMLElement;
  
  // HTML layout
  overlay.innerHTML = `
    <div class="splice-container">
      <div class="splice-header">Genome Synthesis</div>
      
      <div class="splice-stage">
        <div class="splice-parent parent-a">
          <div class="splice-parent-label">Parent A</div>
          <div class="splice-parent-emoji">${creatureA.emoji}</div>
          <div class="splice-parent-name">${creatureA.name}</div>
        </div>
        
        <div class="splice-helix-box">
          <canvas class="splice-helix-canvas"></canvas>
        </div>
        
        <div class="splice-parent parent-b">
          <div class="splice-parent-label">Parent B</div>
          <div class="splice-parent-emoji">${creatureB.emoji}</div>
          <div class="splice-parent-name">${creatureB.name}</div>
        </div>
      </div>
      
      <div class="splice-progress-wrap">
        <div class="splice-progress-label">Extracting DNA Pairs...</div>
        <div class="splice-progress-bar-bg">
          <div class="splice-progress-bar-fill"></div>
        </div>
      </div>
      
      <div class="splice-log">
        <p class="splice-log-line">Ready to synthesize...</p>
      </div>
      
      <div class="splice-result-reveal">
        <div class="splice-result-banner">SYNTHESIS SUCCESSFUL</div>
        <div class="splice-result-card-wrap"></div>
        
        <div class="splice-stats-compare"></div>
        
        <button class="primary" id="splice-confirm-btn" style="padding: 12px 30px; font-size: 15px; font-family: 'Orbitron', sans-serif;">
          ACCEPT GENOME
        </button>
      </div>
    </div>
  `;
  
  container.appendChild(overlay);
  
  // Fade in overlay
  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });
  
  const canvas = overlay.querySelector(".splice-helix-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  
  // Setup High DPI Canvas
  const dpr = window.devicePixelRatio || 1;
  const W = 240;
  const H = 180;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.scale(dpr, dpr);
  
  // DNA Animation variables
  let rotation = 0;
  let rafId = 0;
  let progress = 0;
  
  // Progress tracker milestones
  const milestones = [
    { threshold: 0.0, text: "Extracting DNA Pairs...", log: "Accessing parent chromosomes... OK." },
    { threshold: 0.25, text: "Sequencing Chromosomes...", log: "Mapping base pairs: A-T, G-C... OK." },
    { threshold: 0.5, text: "Combining Genomic Strands...", log: "Recombining active alleles... Splicing slots." },
    { threshold: 0.75, text: "Resolving Mutations...", log: "Validating hybrid genome safety... 0 errors." },
    { threshold: 0.95, text: "Stabilizing Chimeric Embryo...", log: "Gene-folding stabilized. DNA match verified." }
  ];
  
  const progressBar = overlay.querySelector(".splice-progress-bar-fill") as HTMLElement;
  const progressLabel = overlay.querySelector(".splice-progress-label") as HTMLElement;
  const logContainer = overlay.querySelector(".splice-log") as HTMLElement;
  
  function addLog(text: string) {
    const line = el("p", { class: "splice-log-line" }, [text]);
    logContainer.appendChild(line);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  
  let currentMilestoneIdx = 0;
  
  // Draw DNA double helix
  function animate() {
    rotation += 0.05;
    
    // Clear canvas
    ctx.clearRect(0, 0, W, H);
    
    // Draw central spinning helix
    const centerY = H / 2;
    const strandWidth = W * 0.8;
    const nodes = 12;
    const amplitude = 26;
    
    ctx.lineWidth = 1.5;
    
    for (let i = 0; i < nodes; i++) {
      const x = (W - strandWidth) / 2 + (i / (nodes - 1)) * strandWidth;
      const angle = (i * 0.8) + rotation;
      
      const y1 = centerY + Math.sin(angle) * amplitude;
      const y2 = centerY - Math.sin(angle) * amplitude;
      
      // Node colors based on progress
      const nodeColor1 = `hsl(${(i * 20 + rotation * 50) % 360}, 85%, 65%)`;
      const nodeColor2 = `hsl(${(i * 20 + rotation * 50 + 180) % 360}, 85%, 65%)`;
      
      // Draw bridge lines between strands
      ctx.strokeStyle = "rgba(122, 162, 255, 0.25)";
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
      
      // Draw nodes
      ctx.fillStyle = nodeColor1;
      ctx.beginPath();
      ctx.arc(x, y1, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = nodeColor2;
      ctx.beginPath();
      ctx.arc(x, y2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Slow sound effect beep every now and then
    if (Math.random() < 0.015 && progress < 1) {
      sfxAbility("armor"); // subtle glow chime
    }
    
    // Update progress
    if (progress < 1) {
      progress += 0.0075;
      if (progress > 1) progress = 1;
      
      progressBar.style.width = `${progress * 100}%`;
      
      // Check milestones
      const nextMilestone = milestones[currentMilestoneIdx];
      if (nextMilestone && progress >= nextMilestone.threshold) {
        progressLabel.textContent = nextMilestone.text;
        addLog(nextMilestone.log);
        currentMilestoneIdx++;
      }
      
      rafId = requestAnimationFrame(animate);
    } else {
      // Splicing complete! Show reveal.
      cancelAnimationFrame(rafId);
      showReveal();
    }
  }
  
  // Splicing finished - show child reveal
  function showReveal() {
    sfxAbility("shock"); // lightning impact sound!
    
    const reveal = overlay.querySelector(".splice-result-reveal") as HTMLElement;
    reveal.classList.add("active");
    
    // Populate card
    const cardWrap = reveal.querySelector(".splice-result-card-wrap") as HTMLElement;
    clear(cardWrap);
    cardWrap.appendChild(creatureCard(creatureChild));
    
    // Populate comparison stats
    const compareBox = reveal.querySelector(".splice-stats-compare") as HTMLElement;
    clear(compareBox);
    
    const statsList = [
      { key: "health", label: "❤ Health" },
      { key: "attack", label: "⚔ Attack" },
      { key: "defense", label: "🛡 Defense" },
      { key: "speed", label: "⚡ Speed" },
      { key: "energy", label: "✨ Energy" }
    ] as const;
    
    statsList.forEach(({ key, label }) => {
      const valA = creatureA.stats[key];
      const valChild = creatureChild.stats[key];
      const diff = valChild - valA;
      
      let diffText = "";
      let cls = "equal";
      
      if (diff > 0) {
        diffText = `+${diff}`;
        cls = "plus";
      } else if (diff < 0) {
        diffText = `${diff}`;
        cls = "minus";
      } else {
        diffText = "--";
      }
      
      const row = el("div", { class: `splice-stat-diff ${cls}` }, [
        el("span", {}, [label]),
        el("b", {}, [`${valChild} (${diffText})`])
      ]);
      compareBox.appendChild(row);
    });
    
    const confirmBtn = reveal.querySelector("#splice-confirm-btn") as HTMLButtonElement;
    confirmBtn.addEventListener("click", () => {
      // Fade out and remove
      overlay.classList.remove("active");
      setTimeout(() => {
        overlay.remove();
        onConfirm();
      }, 400);
    });
  }
  
  // Start loop
  rafId = requestAnimationFrame(animate);
}
