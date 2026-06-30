import * as THREE from "three";
import { projects } from "./data.js";
import { vertexShader, fragmentShader } from "./shaders.js";

const config = {
  cellSize: 0.75,
  zoomLevel: 1.25,
  lerpFactor: 0.075,
  borderColor: "rgba(255, 255, 255, 0.15)",
  backgroundColor: "rgba(0, 0, 0, 1)",
  textColor: "rgba(128, 128, 128, 1)",
  hoverColor: "rgba(255, 255, 255, 0)",
};

let scene, camera, renderer, plane;
let isDragging = false,
  isClick = true,
  clickStartTime = 0;
let previousMouse = { x: 0, y: 0 };
let offset = { x: 0, y: 0 },
  targetOffset = { x: 0, y: 0 };
let mousePosition = { x: -1, y: -1 };
let zoomLevel = 1.0,
  targetZoom = 1.0;
let nameTextures = [];
let tagsTextures = [];

const rgbaToArray = (rgba) => {
  const match = rgba.match(/rgba?\(([^)]+)\)/);
  if (!match) return [1, 1, 1, 1];
  return match[1]
    .split(",")
    .map((v, i) =>
      i < 3 ? parseFloat(v.trim()) / 255 : parseFloat(v.trim() || 1)
    );
};

// Font loading utility
const loadFont = async (fontFamily) => {
  try {
    console.log(`Loading font: ${fontFamily}`);
    
    // Check if font is available first
    const fontAvailable = document.fonts.check(`80px "${fontFamily}"`);
    console.log(`Font check result for ${fontFamily}:`, fontAvailable);
    
    // Force load the font
    await document.fonts.load(`80px "${fontFamily}"`);
    
    // Check again after loading
    const fontAvailableAfterLoad = document.fonts.check(`80px "${fontFamily}"`);
    console.log(`Font available after load for ${fontFamily}:`, fontAvailableAfterLoad);
    
    console.log(`Font loaded successfully: ${fontFamily}`);
    return fontAvailableAfterLoad;
  } catch (error) {
    console.warn(`Failed to load font ${fontFamily}, using fallback`, error);
    return false;
  }
};

// Create texture for name and year only
const createNameTexture = async (title, year) => {
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 128;  // Smaller canvas for just name/year
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, 2048, 128);
  ctx.fillStyle = config.textColor;
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = false;

  ctx.font = "60px 'At Hauss Mono', monospace";
  
  // Draw title on left
  ctx.textAlign = "left";
  ctx.fillText(title.toUpperCase(), 30, 22);
  
  // Draw year on right
  ctx.textAlign = "right";
  ctx.fillText(year.toString().toUpperCase(), 2048 - 30, 22);

  const texture = new THREE.CanvasTexture(canvas);
  Object.assign(texture, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    flipY: false,
    generateMipmaps: false,
    format: THREE.RGBAFormat,
  });

  return texture;
};

// Create texture for tags only
const createTagsTexture = async (tags = []) => {
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 180;  // Increased from 128 to 180 to accommodate larger tags
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, 2048, 180);

  if (tags && tags.length > 0) {
    ctx.font = "60px 'At Hauss Mono', monospace";  // Decreased from 80px to 60px
    ctx.textBaseline = "middle";
    ctx.imageSmoothingEnabled = false;
    
    let xOffset = 30;
    const yPosition = 90; // Center of new canvas height
    const tagPadding = 32;  // Decreased from 40 to 32
    const tagHeight = 80;  // Decreased from 100 to 80
    
    for (let i = 0; i < Math.min(tags.length, 4); i++) {
      const tag = tags[i].toUpperCase();
      const textWidth = ctx.measureText(tag).width;
      const tagWidth = textWidth + tagPadding * 2;
      
      if (xOffset + tagWidth > 2048 - 30) break;
      
      const tagX = xOffset;
      const tagY = yPosition - tagHeight / 2;
      
      // Draw glassmorphism tag background
      // Outer glow/shadow effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.roundRect(tagX - 2, tagY - 2, tagWidth + 4, tagHeight + 4, tagHeight / 2);
      ctx.fill();
      
      // Main glass background - much darker
      ctx.fillStyle = "rgba(40, 40, 40, 0.85)";
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagWidth, tagHeight, tagHeight / 2);
      ctx.fill();
      
      // Glass border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Inner highlight for glass effect
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.roundRect(tagX + 4, tagY + 4, tagWidth - 8, tagHeight / 2 - 4, tagHeight / 2);
      ctx.fill();
      
      // Draw tag text
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.textAlign = "center";
      ctx.fillText(tag, tagX + tagWidth / 2, yPosition);
      
      xOffset = tagX + tagWidth + 24;  // Increased spacing between tags from 20 to 24
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  Object.assign(texture, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    flipY: false,
    generateMipmaps: false,
    format: THREE.RGBAFormat,
  });

  return texture;
};



const createTextureAtlas = (textures, isText = false) => {
  const atlasSize = Math.ceil(Math.sqrt(textures.length));
  const textureSize = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = atlasSize * textureSize;
  const ctx = canvas.getContext("2d");

  if (isText) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  textures.forEach((texture, index) => {
    const x = (index % atlasSize) * textureSize;
    const y = Math.floor(index / atlasSize) * textureSize;

    if (isText && texture.source?.data) {
      ctx.drawImage(texture.source.data, x, y, textureSize, textureSize);
    } else if (!isText && texture.image?.complete) {
      ctx.drawImage(texture.image, x, y, textureSize, textureSize);
    }
  });

  const atlasTexture = new THREE.CanvasTexture(canvas);
  Object.assign(atlasTexture, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    flipY: false,
  });

  return atlasTexture;
};

const loadTextures = async () => {
  const textureLoader = new THREE.TextureLoader();
  const imageTextures = [];
  let loadedCount = 0;

  return new Promise(async (resolve) => {
    // Pre-load name textures (title + year)
    const nameTexturePromises = projects.map(project => 
      createNameTexture(project.title, project.year)
    );
    const loadedNameTextures = await Promise.all(nameTexturePromises);
    nameTextures.push(...loadedNameTextures);

    // Pre-load tags textures
    const tagsTexturePromises = projects.map(project => 
      createTagsTexture(project.tags)
    );
    const loadedTagsTextures = await Promise.all(tagsTexturePromises);
    tagsTextures.push(...loadedTagsTextures);

    projects.forEach((project) => {
      const texture = textureLoader.load(project.image, () => {
        if (++loadedCount === projects.length) resolve(imageTextures);
      });

      Object.assign(texture, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });

      imageTextures.push(texture);
    });
  });
};

const updateMousePosition = (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mousePosition.x = event.clientX - rect.left;
  mousePosition.y = event.clientY - rect.top;
  plane?.material.uniforms.uMousePos.value.set(
    mousePosition.x,
    mousePosition.y
  );
};

const startDrag = (x, y) => {
  isDragging = true;
  isClick = true;
  clickStartTime = Date.now();
  document.body.classList.add("dragging");
  previousMouse.x = x;
  previousMouse.y = y;
  setTimeout(() => isDragging && (targetZoom = config.zoomLevel), 150);
};

const onPointerDown = (e) => startDrag(e.clientX, e.clientY);
const onTouchStart = (e) => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY);
};

const handleMove = (currentX, currentY) => {
  if (!isDragging || currentX === undefined || currentY === undefined) return;

  const deltaX = currentX - previousMouse.x;
  const deltaY = currentY - previousMouse.y;

  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
    isClick = false;
    if (targetZoom === 1.0) targetZoom = config.zoomLevel;
  }

  targetOffset.x -= deltaX * 0.003;
  targetOffset.y += deltaY * 0.003;
  previousMouse.x = currentX;
  previousMouse.y = currentY;
};

const onPointerMove = (e) => handleMove(e.clientX, e.clientY);
const onTouchMove = (e) => {
  e.preventDefault();
  handleMove(e.touches[0].clientX, e.touches[0].clientY);
};

const onPointerUp = (event) => {
  isDragging = false;
  document.body.classList.remove("dragging");
  targetZoom = 1.0;

  if (isClick && Date.now() - clickStartTime < 200) {
    const endX = event.clientX || event.changedTouches?.[0]?.clientX;
    const endY = event.clientY || event.changedTouches?.[0]?.clientY;

    if (endX !== undefined && endY !== undefined) {
      const clickedElement = document.elementFromPoint(endX, endY);
      
      const isUIElement = clickedElement && (
        clickedElement.closest('.filters-container') ||
        clickedElement.closest('#filterToggle') ||
        clickedElement.closest('.list-view-wrapper') ||
        clickedElement.closest('.profile-overlay') ||
        clickedElement.closest('.view-toggle-container')
      );
      
      if (!isUIElement) {
        const rect = renderer.domElement.getBoundingClientRect();
        const screenX = ((endX - rect.left) / rect.width) * 2 - 1;
        const screenY = -(((endY - rect.top) / rect.height) * 2 - 1);

        const radius = Math.sqrt(screenX * screenX + screenY * screenY);
        const distortion = 1.0 - 0.08 * radius * radius;

        let worldX =
          screenX * distortion * (rect.width / rect.height) * zoomLevel +
          offset.x;
        let worldY = screenY * distortion * zoomLevel + offset.y;

        const cellX = Math.floor(worldX / config.cellSize);
        const cellY = Math.floor(worldY / config.cellSize);
        const texIndex = Math.floor((cellX + cellY * 3.0) % projects.length);
        const actualIndex = texIndex < 0 ? projects.length + texIndex : texIndex;

        if (projects[actualIndex]) {
          openProfileOverlay(projects[actualIndex], actualIndex);
        }
      }
    }
  }
};

const onWindowResize = () => {
  const container = document.getElementById("gallery");
  if (!container) return;

  const { offsetWidth: width, offsetHeight: height } = container;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  plane?.material.uniforms.uResolution.value.set(width, height);
};

const setupEventListeners = () => {
  document.addEventListener("mousedown", onPointerDown);
  document.addEventListener("mousemove", onPointerMove);
  document.addEventListener("mouseup", onPointerUp);
  document.addEventListener("mouseleave", onPointerUp);

  const passiveOpts = { passive: false };
  document.addEventListener("touchstart", onTouchStart, passiveOpts);
  document.addEventListener("touchmove", onTouchMove, passiveOpts);
  document.addEventListener("touchend", onPointerUp, passiveOpts);

  window.addEventListener("resize", onWindowResize);
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  renderer.domElement.addEventListener("mousemove", updateMousePosition);
  renderer.domElement.addEventListener("mouseleave", () => {
    mousePosition.x = mousePosition.y = -1;
    plane?.material.uniforms.uMousePos.value.set(-1, -1);
  });
};

const animate = () => {
  requestAnimationFrame(animate);

  offset.x += (targetOffset.x - offset.x) * config.lerpFactor;
  offset.y += (targetOffset.y - offset.y) * config.lerpFactor;
  zoomLevel += (targetZoom - zoomLevel) * config.lerpFactor;

  if (plane?.material.uniforms) {
    plane.material.uniforms.uOffset.value.set(offset.x, offset.y);
    plane.material.uniforms.uZoom.value = zoomLevel;
  }

  renderer.render(scene, camera);
};

const init = async () => {
  const container = document.getElementById("gallery");
  if (!container) return;

  // Wait for fonts to be ready
  await document.fonts.ready;
  console.log('Document fonts ready!');
  
  // Additional wait to ensure font files are fully loaded
  await new Promise(resolve => setTimeout(resolve, 200));

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(container.offsetWidth, container.offsetHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const bgColor = rgbaToArray(config.backgroundColor);
  renderer.setClearColor(
    new THREE.Color(bgColor[0], bgColor[1], bgColor[2]),
    bgColor[3]
  );
  container.appendChild(renderer.domElement);

  const imageTextures = await loadTextures();
  const imageAtlas = createTextureAtlas(imageTextures, false);
  const nameAtlas = createTextureAtlas(nameTextures, true);
  const tagsAtlas = createTextureAtlas(tagsTextures, true);

  const uniforms = {
    uOffset: { value: new THREE.Vector2(0, 0) },
    uResolution: {
      value: new THREE.Vector2(container.offsetWidth, container.offsetHeight),
    },
    uBorderColor: {
      value: new THREE.Vector4(...rgbaToArray(config.borderColor)),
    },
    uHoverColor: {
      value: new THREE.Vector4(...rgbaToArray(config.hoverColor)),
    },
    uBackgroundColor: {
      value: new THREE.Vector4(...rgbaToArray(config.backgroundColor)),
    },
    uMousePos: { value: new THREE.Vector2(-1, -1) },
    uZoom: { value: 1.0 },
    uCellSize: { value: config.cellSize },
    uTextureCount: { value: projects.length },
    uImageAtlas: { value: imageAtlas },
    uNameAtlas: { value: tagsAtlas },  // Swapped
    uTagsAtlas: { value: nameAtlas },  // Swapped
  };

  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
  });

  plane = new THREE.Mesh(geometry, material);
  scene.add(plane);

  setupEventListeners();
  setupHeader();
  setupViewToggle();
  animate();
};

// View Toggle and List View Functionality
let currentView = 'wall';

// Header functionality
const setupHeader = () => {
  const contactCta = document.querySelector('.contact-cta a');

  // Contact CTA functionality
  if (contactCta) {
    contactCta.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Switch to list view if not already there
      if (currentView !== 'list') {
        const listToggle = document.querySelector('[data-view="list"]');
        if (listToggle) {
          listToggle.click();
        }
      }
      
      // Scroll to top of list view
      setTimeout(() => {
        const listWrapper = document.querySelector('.list-view-wrapper');
        if (listWrapper && listWrapper.style.display !== 'none') {
          listWrapper.scrollTop = 0;
        }
      }, 300);
      
      console.log('Contact CTA clicked - switched to list view');
    });
  }
};

const setupViewToggle = () => {
  const toggleButtons = document.querySelectorAll('.toggle-option-container');
  const listViewWrapper = document.querySelector('.list-view-wrapper');
  const gallerySection = document.querySelector('#gallery');

  // Initialize list view content
  populateListView();

  // Add click handlers to toggle buttons
  toggleButtons.forEach(button => {
    button.addEventListener('click', () => {
      const viewType = button.getAttribute('data-view');
      switchView(viewType);
    });
  });

  // Function to switch between views
  const switchView = (viewType) => {
    if (currentView === viewType) return;

    currentView = viewType;

    // Update active state
    toggleButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewType);
    });

    // Switch between wall and list views with proper transitions
    if (viewType === 'list') {
      listViewWrapper.style.display = 'flex';
      listViewWrapper.classList.add('is-open');
      listViewWrapper.classList.remove('hidden');
      gallerySection.style.display = 'none';
    } else {
      listViewWrapper.classList.remove('is-open');
      listViewWrapper.classList.add('hidden');
      gallerySection.style.display = 'block';
      
      // Hide the list view after transition
      setTimeout(() => {
        if (currentView === 'wall') {
          listViewWrapper.style.display = 'none';
        }
      }, 300);
    }
  };
};

const populateListView = () => {
  const listContent = document.getElementById('list-content');
  if (!listContent) return;

  // Branch mapping based on student names or random assignment
  const getBranch = (title, index) => {
    const branches = ['CSE', 'CAI', 'CII', 'CCE', 'ECE', 'MEE', 'ITE'];
    return branches[index % branches.length];
  };

  // Get accomplishment tags based on existing project tags
  const getAccomplishmentTags = (tags) => {
    const accomplishmentTags = [];
    
    if (tags.some(tag => tag.includes('GOOGLE') || tag.includes('META') || tag.includes('APPLE'))) {
      accomplishmentTags.push('EXPERIENCE');
    }
    if (tags.some(tag => tag.includes('ACL') || tag.includes('ICML') || tag.includes('NEURIPS'))) {
      accomplishmentTags.push('PRODUCT', 'CAMPAIGN');
    }
    if (tags.some(tag => tag.includes('DESIGN') || tag.includes('UX'))) {
      accomplishmentTags.push('CONTENT');
    }
    if (tags.some(tag => tag.includes('AI') || tag.includes('ML'))) {
      accomplishmentTags.push('AI');
    }
    if (tags.some(tag => tag.includes('HCI') || tag.includes('PSYCHOLOGY'))) {
      accomplishmentTags.push('PHYSICAL');
    }
    
    // Add some default tags if none were added
    if (accomplishmentTags.length === 0) {
      const defaultTags = ['PRODUCT', 'CAMPAIGN', 'CONTENT', 'GAME'];
      accomplishmentTags.push(defaultTags[Math.floor(Math.random() * defaultTags.length)]);
    }
    
    return accomplishmentTags.slice(0, 3); // Limit to 3 tags max
  };

  const listHTML = projects.map((project, index) => `
    <li class="student-list-item-wrapper">
      <a href="#" class="student-link" data-index="${index}">
        <div class="student-info">
          <h3 class="student-title">${project.title}</h3>
        </div>
        <div class="student-meta-info">
          <div class="accomplishment-tags">
            ${getAccomplishmentTags(project.tags).map(tag => `
              <span class="accomplishment-pill">${tag}</span>
            `).join('')}
          </div>
        </div>
        <div class="student-branch">
          <p class="student-organization">${getBranch(project.title, index)}</p>
        </div>
      </a>
    </li>
  `).join('');

  listContent.innerHTML = listHTML;

  // Add click handlers to list items to switch back to wall view
  const listLinks = listContent.querySelectorAll('.student-link');
  listLinks.forEach((link, index) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Switch to wall view and focus on the clicked item
      const toggleButtons = document.querySelectorAll('.toggle-option-container');
      toggleButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === 'wall');
      });
      
      const listViewWrapper = document.querySelector('.list-view-wrapper');
      const gallerySection = document.querySelector('#gallery');
      
      listViewWrapper.classList.remove('is-open');
      listViewWrapper.classList.add('hidden');
      gallerySection.style.display = 'block';
      currentView = 'wall';
      
      // Hide the list view after transition
      setTimeout(() => {
        listViewWrapper.style.display = 'none';
      }, 300);

      // Optional: Add some visual feedback or navigation to the specific item
      console.log(`Switched to wall view, focusing on project: ${projects[index].title}`);
    });
  });
};

// ====== FILTERS FUNCTIONALITY ======
let activeFilters = {
  category: 'all',
  department: 'all',
  year: 'all'
};

const setupFilters = () => {
  const filterToggleBtn = document.getElementById('filterToggle');
  const filtersContainer = document.querySelector('.filters-container');
  const filterPills = document.querySelectorAll('.filter-pill');
  
  // Toggle filters panel
  if (filterToggleBtn) {
    filterToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = filtersContainer.classList.contains('active');
      filtersContainer.classList.toggle('active');
      filterToggleBtn.classList.toggle('active');
      
      // Add escape key listener when filters are open
      if (!isActive) {
        document.addEventListener('keydown', handleEscapeKey);
      } else {
        document.removeEventListener('keydown', handleEscapeKey);
      }
    });
  }
  
  // Prevent filter panel clicks from triggering gallery cell clicks
  filtersContainer.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  // Close filters with escape key
  const handleEscapeKey = (e) => {
    if (e.key === 'Escape') {
      filtersContainer.classList.remove('active');
      filterToggleBtn.classList.remove('active');
      document.removeEventListener('keydown', handleEscapeKey);
    }
  };
  
  // Close filters when clicking outside
  document.addEventListener('click', (e) => {
    if (!filtersContainer.contains(e.target) && !filterToggleBtn.contains(e.target)) {
      filtersContainer.classList.remove('active');
      filterToggleBtn.classList.remove('active');
      document.removeEventListener('keydown', handleEscapeKey);
    }
  });
  
  // Handle filter pill clicks
  filterPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const filterType = pill.getAttribute('data-type');
      const filterValue = pill.getAttribute('data-filter');
      
      // Update active state within the same filter type
      const sameTypeFilters = document.querySelectorAll(`[data-type="${filterType}"]`);
      sameTypeFilters.forEach(filter => filter.classList.remove('active'));
      pill.classList.add('active');
      
      // Update active filters state
      activeFilters[filterType] = filterValue;
      
      // Apply filters
      applyFilters();
      
      // Add visual feedback
      pill.style.transform = 'scale(0.95)';
      setTimeout(() => {
        pill.style.transform = '';
      }, 150);
      
      console.log('Active filters:', activeFilters);
    });
  });
};

const applyFilters = () => {
  // This function will be connected to the gallery and list view
  // For now, we'll just log the active filters
  console.log('Applying filters:', activeFilters);
  
  // TODO: Filter the gallery tiles and list items based on activeFilters
  // This will be implemented when connecting to the views
  
  // Update filter count display (optional enhancement)
  updateFilterDisplay();
};

const updateFilterDisplay = () => {
  const filterToggleBtn = document.getElementById('filterToggle');
  const activeFilterCount = Object.values(activeFilters).filter(filter => filter !== 'all').length;
  
  if (activeFilterCount > 0) {
    filterToggleBtn.classList.add('has-filters');
    // Could add a badge with the count
  } else {
    filterToggleBtn.classList.remove('has-filters');
  }
};

const resetFilters = () => {
  activeFilters = {
    category: 'all',
    department: 'all',
    year: 'all'
  };
  
  // Reset all filter pills to default state
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.remove('active');
  });
  
  // Activate all "ALL" filters
  document.querySelectorAll('[data-filter="all"]').forEach(pill => {
    pill.classList.add('active');
  });
  
  applyFilters();
};

// ====== PROFILE OVERLAY ======
let currentProfileIndex = -1;

const setupProfileOverlay = () => {
  const overlay = document.getElementById('profileOverlay');
  if (!overlay) return;

  const backdrop = overlay.querySelector('.profile-backdrop');
  const closeBtn = overlay.querySelector('.profile-close-btn');
  const nextBtn = overlay.querySelector('.profile-next-btn');

  backdrop.addEventListener('click', closeProfileOverlay);
  closeBtn.addEventListener('click', closeProfileOverlay);
  nextBtn.addEventListener('click', openNextProfile);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeProfileOverlay();
  });
};

const openProfileOverlay = (student, index) => {
  const overlay = document.getElementById('profileOverlay');
  if (!overlay) return;

  currentProfileIndex = index;

  document.getElementById('profilePhoto').src = student.image;
  document.getElementById('profilePhoto').alt = student.title;
  document.getElementById('profileName').innerHTML = student.title.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join('<br>');
  document.getElementById('profileType').textContent = `${student.type} at ${student.tags[0] || ''}`;
  document.getElementById('profileBio').textContent = student.bio;
  document.getElementById('profileRegNo').textContent = student.regNo;
  document.getElementById('profileDepartment').textContent = student.department;
  document.getElementById('profileDurationType').textContent = student.type;
  document.getElementById('profileDuration').textContent = student.duration;
  document.getElementById('profileStipend').textContent = student.stipend;
  document.getElementById('profileLinkedin').href = student.socials.linkedin;
  document.getElementById('profileWebsite').href = student.socials.website;

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', handleOverlayEscape);
};

const closeProfileOverlay = () => {
  const overlay = document.getElementById('profileOverlay');
  if (!overlay) return;

  overlay.classList.add('closing');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleOverlayEscape);

  setTimeout(() => {
    overlay.classList.remove('closing');
  }, 350);
};

const openNextProfile = () => {
  const nextIndex = (currentProfileIndex + 1) % projects.length;
  const overlay = document.getElementById('profileOverlay');
  if (!overlay) return;

  const student = projects[nextIndex];
  currentProfileIndex = nextIndex;

  document.getElementById('profilePhoto').src = student.image;
  document.getElementById('profilePhoto').alt = student.title;
  document.getElementById('profileName').innerHTML = student.title.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join('<br>');
  document.getElementById('profileType').textContent = `${student.type} at ${student.tags[0] || ''}`;
  document.getElementById('profileBio').textContent = student.bio;
  document.getElementById('profileRegNo').textContent = student.regNo;
  document.getElementById('profileDepartment').textContent = student.department;
  document.getElementById('profileDurationType').textContent = student.type;
  document.getElementById('profileDuration').textContent = student.duration;
  document.getElementById('profileStipend').textContent = student.stipend;
  document.getElementById('profileLinkedin').href = student.socials.linkedin;
  document.getElementById('profileWebsite').href = student.socials.website;
};

const handleOverlayEscape = (e) => {
  if (e.key === 'Escape') closeProfileOverlay();
};

init();
setupFilters();
setupProfileOverlay();

// Wait for all fonts to be ready before initializing
document.fonts.ready.then(() => {
  console.log('All fonts are ready!');
  console.log('Available fonts:', Array.from(document.fonts).map(f => f.family));
});
