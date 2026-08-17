import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def repair_jsx_tags(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # If line contains <ConfirmButton but not >
        if '<ConfirmButton' in line and '>' not in line:
            # Look ahead for a closing tag part
            j = i + 1
            found_closing = False
            while j < len(lines) and j < i + 5: # Limit lookahead
                next_line = lines[j].strip()
                # If next line starts with > or is just >
                if next_line == '>' or next_line.startswith('>'):
                    # Merge them
                    line = line.rstrip() + ' >\n'
                    i = j
                    found_closing = True
                    break
                j += 1
            
            # If still not found, it might be a line that ends abruptly
            if not found_closing:
                line = line.rstrip() + ' >\n'
        
        new_lines.append(line)
        i += 1

    # Final pass: remove empty lines that were previously just '>' or 'noConfirm>'
    # Actually, let's just write and see
    with open(filepath, 'w') as f:
        f.writelines(new_lines)

for f in files:
    repair_jsx_tags(f)
