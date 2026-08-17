import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def repair_and_refine(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. First, restore ALL ConfirmButtons to have noConfirm if they are "safe"
    # Safe actions
    safe_actions = [
        'setActiveSection', 'setActiveTab', 'handleTabChange', 'setStep',
        'setAuthMode', 'setFilter', 'setIsAdding', 'setIsEditing',
        'setSelected', 'setExpanded', 'setShow', 'setMenuOpen',
        'setCopied', 'setPreview', 'navigate', 'toggleDarkMode', 'onClose',
        'setIsAddingFeedback', 'setIsResolving', 'setEditingFeedback'
    ]
    
    # Destructive actions
    destructive = ['delete', 'remove', 'save', 'update', 'resolve', 'publish', 'archive', 'restore', 'submit', 'clear', 'reset']

    def replacer(match):
        tag = match.group(0)
        # Check if it contains a safe action
        is_safe = any(sa in tag for sa in safe_actions)
        # Check if it contains a destructive action
        is_destructive = any(da in tag.lower() for da in destructive)
        
        if is_safe and not is_destructive:
            if 'noConfirm' not in tag:
                if tag.endswith('/>'):
                    return tag.replace('/>', ' noConfirm />')
                return tag.replace('>', ' noConfirm>')
        return tag

    # Match <ConfirmButton ... > across lines
    content = re.sub(r'<ConfirmButton\b[^>]*?>', replacer, content, flags=re.DOTALL)

    # 2. Final syntax check for arrow functions
    content = content.replace('() =>>', '() =>')
    content = content.replace(') =>>', ') =>')

    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    repair_and_refine(f)
