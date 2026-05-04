let activeMenu = null;

export function showWaypointContextMenu(marker, waypointIndex, event, onDelete) {
  const menu = document.getElementById('waypoint-context-menu');
  if (!menu) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  hideWaypointContextMenu();
  activeMenu = menu;

  const markerElement = marker.getElement();
  const rect = markerElement.getBoundingClientRect();
  menu.classList.remove('hidden');

  const menuWidth = menu.offsetWidth || 180;
  const menuHeight = menu.offsetHeight || 48;
  let left = rect.left + rect.width / 2 - menuWidth / 2;
  let top = rect.top - menuHeight - 8;

  if (left < 8) {
    left = 8;
  }
  if (left + menuWidth > window.innerWidth - 8) {
    left = window.innerWidth - menuWidth - 8;
  }
  if (top < 8) {
    top = rect.bottom + 8;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const deleteButton = document.getElementById('waypoint-context-menu-delete');
  const handleDelete = (deleteEvent) => {
    deleteEvent.preventDefault();
    deleteEvent.stopPropagation();
    hideWaypointContextMenu();
    onDelete(waypointIndex);
  };

  deleteButton.onclick = handleDelete;

  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick, true);
    document.addEventListener('contextmenu', handleOutsideClick, true);
  }, 0);
}

function handleOutsideClick(event) {
  if (activeMenu && !activeMenu.contains(event.target)) {
    hideWaypointContextMenu();
  }
}

export function hideWaypointContextMenu() {
  const menu = document.getElementById('waypoint-context-menu');
  if (menu) {
    menu.classList.add('hidden');
  }

  activeMenu = null;
  document.removeEventListener('click', handleOutsideClick, true);
  document.removeEventListener('contextmenu', handleOutsideClick, true);
}
