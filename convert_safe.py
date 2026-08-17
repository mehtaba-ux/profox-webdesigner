import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def convert_safe_buttons(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Define safe actions that don't need confirmation
    safe_actions = [
        'setActiveSection', 'setActiveTab', 'handleTabChange', 'setStep',
        'setAuthMode', 'setFilter', 'setIsAdding', 'setIsEditing',
        'setSelected', 'setExpanded', 'setShow', 'setMenuOpen',
        'setCopied', 'setPreview', 'navigate', 'toggleDarkMode', 'onClose'
    ]

    # This is a complex task for regex but we can try to find ConfirmButton tags
    # that contain one of these safe actions in their onClick prop.
    
    # Let's find all <ConfirmButton ... > and if they contain safe actions, add noConfirm
    
    def add_noconfirm_if_safe(match):
        full_tag = match.group(0)
        # Skip if it already has noConfirm
        if 'noConfirm' in full_tag:
            return full_tag
            
        # Dangerous actions should NOT have noConfirm added
        dangerous_keywords = ['delete', 'remove', 'save', 'update', 'resolve', 'publish', 'archive', 'restore', 'submit', 'clear', 'reset']
        
        # If it contains a safe action AND NO dangerous action
        is_safe = any(sa in full_tag for sa in safe_actions)
        is_dangerous = any(da in full_tag.lower() for da in dangerous_keywords)
        
        # Exception: some dangerous sounding ones are in safe setters like setSelected(fb.id)
        # but handleDelete(fb.id) is definitely dangerous.
        
        if is_safe and not is_dangerous:
             # Add noConfirm before the closing >
             if full_tag.endswith('/>'):
                 return full_tag.replace('/>', ' noConfirm />')
             return full_tag.replace('>', ' noConfirm>')
        
        return full_tag

    # Use a more robust regex that can span lines (non-greedy)
    # This matches <ConfirmButton ... > but doesn't cross into the next tag
    content = re.sub(r'<ConfirmButton\b[^>]*?>', add_noconfirm_if_safe, content, flags=re.DOTALL)

    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    convert_safe_buttons(f)
