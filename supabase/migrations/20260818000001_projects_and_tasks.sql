-- Project Stages Enum-like check constraint
-- 1. Sales Handover
-- 2. Client Onboarding
-- 3. Requirements
-- 4. Content
-- 5. UI/UX Design
-- 6. Client Design Approval
-- 7. Development
-- 8. QA
-- 9. Client Review
-- 10. Final Revisions
-- 11. Launch
-- 12. Handover
-- 13. Completed

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_number TEXT UNIQUE NOT NULL,
    project_name TEXT NOT NULL,
    client_id UUID REFERENCES clients(id),
    source_opportunity_id UUID REFERENCES crm_opportunities(id),
    quotation_id UUID REFERENCES quotations(id),
    package_snapshot TEXT, -- Descriptive name of package purchased
    project_value NUMERIC NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    project_manager_id UUID REFERENCES auth.users(id),
    stage TEXT DEFAULT 'Sales Handover',
    priority TEXT DEFAULT 'Normal',
    status TEXT DEFAULT 'Active', -- Active, Paused, Cancelled, Completed
    start_date DATE,
    target_date DATE,
    completed_at TIMESTAMPTZ,
    requirements_summary TEXT,
    scope_summary TEXT,
    exclusions TEXT,
    sales_handover_notes TEXT,
    internal_notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Team Assignments
CREATE TABLE IF NOT EXISTS project_team (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT, -- Content, UIUX, Developer, QA, etc.
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- Project Tasks
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    department TEXT, -- Content, Design, Development, QA, Management
    assigned_to UUID REFERENCES auth.users(id),
    created_by UUID REFERENCES auth.users(id),
    priority TEXT DEFAULT 'Normal', -- Low, Normal, High, Urgent
    status TEXT DEFAULT 'To Do', -- To Do, In Progress, Review, Changes Required, Done
    start_date DATE,
    due_date DATE,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for Projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to projects"
    ON projects FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "PMs can manage their own projects"
    ON projects FOR ALL
    TO authenticated
    USING (
        project_manager_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Team members can view assigned projects"
    ON projects FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM project_team WHERE project_id = projects.id AND user_id = auth.uid()) OR
        project_manager_id = auth.uid() OR
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Sales can view projects they sold"
    ON projects FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM crm_opportunities 
            WHERE id = projects.source_opportunity_id AND salesperson_id = auth.uid()
        )
    );

-- RLS Policies for Project Team
ALTER TABLE project_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view project team"
    ON project_team FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins and PMs can manage team"
    ON project_team FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') OR
        EXISTS (SELECT 1 FROM projects WHERE id = project_team.project_id AND project_manager_id = auth.uid())
    );

-- RLS Policies for Tasks
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and PMs can manage all tasks in their projects"
    ON project_tasks FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') OR
        EXISTS (SELECT 1 FROM projects WHERE id = project_tasks.project_id AND project_manager_id = auth.uid())
    );

CREATE POLICY "Team members can view tasks in assigned projects"
    ON project_tasks FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM project_team WHERE project_id = project_tasks.project_id AND user_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Assigned users can update their task status and notes"
    ON project_tasks FOR UPDATE
    TO authenticated
    USING (assigned_to = auth.uid())
    WITH CHECK (assigned_to = auth.uid());

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_project_tasks_updated_at BEFORE UPDATE ON project_tasks FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Function to generate project numbers
CREATE OR REPLACE FUNCTION generate_project_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_val BIGINT;
BEGIN
    SELECT count(*) + 1 INTO seq_val FROM projects;
    NEW.project_number := 'PF-PROJ-' || LPAD(seq_val::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_project_number
BEFORE INSERT ON projects
FOR EACH ROW
EXECUTE FUNCTION generate_project_number();

