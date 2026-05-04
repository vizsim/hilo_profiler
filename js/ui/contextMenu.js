import { addWaypointSelection, setEndSelection, setStartSelection, toPoint } from '../map/pointSelection.js';

let contextMenu = null;
let currentLngLat = null;

export function setupContextMenu(map, appState) {
  contextMenu = document.getElementById('context-menu');
  if (!contextMenu) {
    return;
  }

  const mapContainer = map.getContainer();

  map.on('contextmenu', (event) => {
    event.originalEvent?.preventDefault();
    event.originalEvent?.stopPropagation();
    showContextMenu(map, event.lngLat, event.point);
  });

  mapContainer.addEventListener(
    'contextmenu',
    (event) => {
      const canvas = mapContainer.querySelector('canvas');
      if (!canvas || (event.target !== canvas && !canvas.contains(event.target))) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      showContextMenu(map, map.unproject([point.x, point.y]), point);
    },
    true
  );

  map.on('move', hideContextMenu);
  map.on('zoom', hideContextMenu);

  setupMenuHandlers(appState);
}

function showContextMenu(map, lngLat, point) {
  if (!contextMenu) {
    return;
  }

  currentLngLat = lngLat;
  contextMenu.classList.remove('hidden');

  const mapContainer = map.getContainer();
  const containerRect = mapContainer.getBoundingClientRect();
  const menuWidth = contextMenu.offsetWidth || 220;
  const menuHeight = contextMenu.offsetHeight || 160;

  let left = containerRect.left + point.x;
  let top = containerRect.top + point.y;

  if (left + menuWidth > window.innerWidth) {
    left = window.innerWidth - menuWidth - 8;
  }

  if (top + menuHeight > window.innerHeight) {
    top = window.innerHeight - menuHeight - 8;
  }

  contextMenu.style.left = `${Math.max(8, left)}px`;
  contextMenu.style.top = `${Math.max(8, top)}px`;

  setTimeout(() => {
    document.addEventListener('click', handleOutsideInteraction, true);
    document.addEventListener('contextmenu', handleOutsideInteraction, true);
  }, 0);
}

function handleOutsideInteraction(event) {
  if (contextMenu && !contextMenu.contains(event.target)) {
    hideContextMenu();
  }
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.classList.add('hidden');
  }

  currentLngLat = null;
  document.removeEventListener('click', handleOutsideInteraction, true);
  document.removeEventListener('contextmenu', handleOutsideInteraction, true);
}

function setupMenuHandlers(appState) {
  const stopEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  bindMenuAction('context-menu-set-start', (point) => {
    setStartSelection(appState, point);
  }, stopEvent);

  bindMenuAction('context-menu-set-end', (point) => {
    setEndSelection(appState, point);
  }, stopEvent);

  bindMenuAction('context-menu-add-waypoint', (point) => {
    addWaypointSelection(appState, point);
  }, stopEvent);
}

function bindMenuAction(elementId, handler, stopEvent) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.addEventListener('mousedown', stopEvent, true);
  element.addEventListener(
    'click',
    (event) => {
      stopEvent(event);
      const lngLat = currentLngLat;
      hideContextMenu();
      if (lngLat) {
        handler(toPoint(lngLat));
      }
    },
    true
  );
}
