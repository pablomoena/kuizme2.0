// GENERADO AUTOMÁTICAMENTE — no editar a mano.
// Fuente: el esquema real de Postgres. Regenerar con `npm run db:types`.
// El CI corre `npm run db:types:check`, así que un cambio de esquema sin
// regenerar este archivo hace fallar la build antes de llegar a producción.

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      course_pricing: {
        Row: {
          course_id: string;
          organization_id: string;
          kind: Database['public']['Enums']['pricing_kind'];
          amount_cents: number | null;
          currency: string;
          updated_at: string;
        };
        Insert: {
          course_id: string;
          organization_id?: string;
          kind?: Database['public']['Enums']['pricing_kind'];
          amount_cents?: number | null;
          currency?: string;
          updated_at?: string;
        };
        Update: {
          course_id?: string;
          organization_id?: string;
          kind?: Database['public']['Enums']['pricing_kind'];
          amount_cents?: number | null;
          currency?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'course_pricing_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: true;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_pricing_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      courses: {
        Row: {
          id: string;
          organization_id: string;
          slug: string;
          title: string;
          subtitle: string | null;
          description: string | null;
          cover_image_url: string | null;
          status: Database['public']['Enums']['course_status'];
          visibility: Database['public']['Enums']['course_visibility'];
          level: string | null;
          language: string;
          estimated_hours: number | null;
          min_passing_grade: number;
          certificate_enabled: boolean;
          created_by: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
          release_mode: Database['public']['Enums']['course_release_mode'];
          sequential: boolean;
          enrollment_open: boolean;
          enrollment_deadline: string | null;
          max_students: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          slug: string;
          title: string;
          subtitle?: string | null;
          description?: string | null;
          cover_image_url?: string | null;
          status?: Database['public']['Enums']['course_status'];
          visibility?: Database['public']['Enums']['course_visibility'];
          level?: string | null;
          language?: string;
          estimated_hours?: number | null;
          min_passing_grade?: number;
          certificate_enabled?: boolean;
          created_by?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
          release_mode?: Database['public']['Enums']['course_release_mode'];
          sequential?: boolean;
          enrollment_open?: boolean;
          enrollment_deadline?: string | null;
          max_students?: number | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          slug?: string;
          title?: string;
          subtitle?: string | null;
          description?: string | null;
          cover_image_url?: string | null;
          status?: Database['public']['Enums']['course_status'];
          visibility?: Database['public']['Enums']['course_visibility'];
          level?: string | null;
          language?: string;
          estimated_hours?: number | null;
          min_passing_grade?: number;
          certificate_enabled?: boolean;
          created_by?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
          release_mode?: Database['public']['Enums']['course_release_mode'];
          sequential?: boolean;
          enrollment_open?: boolean;
          enrollment_deadline?: string | null;
          max_students?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'courses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'courses_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      enrollment_requests: {
        Row: {
          id: string;
          organization_id: string;
          course_id: string;
          student_id: string;
          status: Database['public']['Enums']['enrollment_request_status'];
          message: string | null;
          resolution_note: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          course_id: string;
          student_id: string;
          status?: Database['public']['Enums']['enrollment_request_status'];
          message?: string | null;
          resolution_note?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          course_id?: string;
          student_id?: string;
          status?: Database['public']['Enums']['enrollment_request_status'];
          message?: string | null;
          resolution_note?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'enrollment_requests_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollment_requests_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollment_requests_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollment_requests_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      enrollments: {
        Row: {
          id: string;
          organization_id: string;
          course_id: string;
          student_id: string;
          status: Database['public']['Enums']['enrollment_status'];
          final_grade: number | null;
          enrolled_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          course_id: string;
          student_id: string;
          status?: Database['public']['Enums']['enrollment_status'];
          final_grade?: number | null;
          enrolled_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          course_id?: string;
          student_id?: string;
          status?: Database['public']['Enums']['enrollment_status'];
          final_grade?: number | null;
          enrolled_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'enrollments_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollments_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollments_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      exam_answers: {
        Row: {
          id: string;
          organization_id: string;
          attempt_id: string;
          question_id: string;
          response: Json | null;
          is_correct: boolean | null;
          points_earned: number | null;
          feedback: string | null;
          graded_by: string | null;
          graded_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          attempt_id: string;
          question_id: string;
          response?: Json | null;
          is_correct?: boolean | null;
          points_earned?: number | null;
          feedback?: string | null;
          graded_by?: string | null;
          graded_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          attempt_id?: string;
          question_id?: string;
          response?: Json | null;
          is_correct?: boolean | null;
          points_earned?: number | null;
          feedback?: string | null;
          graded_by?: string | null;
          graded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exam_answers_attempt_id_fkey';
            columns: ['attempt_id'];
            isOneToOne: false;
            referencedRelation: 'exam_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_answers_graded_by_fkey';
            columns: ['graded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_answers_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_answers_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          },
        ];
      };
      exam_attempts: {
        Row: {
          id: string;
          organization_id: string;
          exam_id: string;
          student_id: string;
          attempt_number: number;
          status: Database['public']['Enums']['attempt_status'];
          score: number | null;
          started_at: string;
          submitted_at: string | null;
          time_spent_seconds: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          exam_id: string;
          student_id: string;
          attempt_number: number;
          status?: Database['public']['Enums']['attempt_status'];
          score?: number | null;
          started_at?: string;
          submitted_at?: string | null;
          time_spent_seconds?: number | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          exam_id?: string;
          student_id?: string;
          attempt_number?: number;
          status?: Database['public']['Enums']['attempt_status'];
          score?: number | null;
          started_at?: string;
          submitted_at?: string | null;
          time_spent_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exam_attempts_exam_id_fkey';
            columns: ['exam_id'];
            isOneToOne: false;
            referencedRelation: 'exams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_attempts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_attempts_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      exam_questions: {
        Row: {
          id: string;
          organization_id: string;
          exam_id: string;
          question_id: string;
          order_index: number;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          exam_id: string;
          question_id: string;
          order_index?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          exam_id?: string;
          question_id?: string;
          order_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'exam_questions_exam_id_fkey';
            columns: ['exam_id'];
            isOneToOne: false;
            referencedRelation: 'exams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_questions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_questions_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          },
        ];
      };
      exams: {
        Row: {
          id: string;
          organization_id: string;
          course_id: string | null;
          title: string;
          description: string | null;
          status: Database['public']['Enums']['exam_status'];
          passing_score: number;
          max_attempts: number;
          time_limit_seconds: number | null;
          available_from: string | null;
          available_until: string | null;
          randomize_questions: boolean;
          randomize_options: boolean;
          show_results: string;
          weight_in_course: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          course_id?: string | null;
          title: string;
          description?: string | null;
          status?: Database['public']['Enums']['exam_status'];
          passing_score?: number;
          max_attempts?: number;
          time_limit_seconds?: number | null;
          available_from?: string | null;
          available_until?: string | null;
          randomize_questions?: boolean;
          randomize_options?: boolean;
          show_results?: string;
          weight_in_course?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          course_id?: string | null;
          title?: string;
          description?: string | null;
          status?: Database['public']['Enums']['exam_status'];
          passing_score?: number;
          max_attempts?: number;
          time_limit_seconds?: number | null;
          available_from?: string | null;
          available_until?: string | null;
          randomize_questions?: boolean;
          randomize_options?: boolean;
          show_results?: string;
          weight_in_course?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exams_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exams_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exams_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      grade_changes: {
        Row: {
          id: string;
          organization_id: string;
          attempt_id: string | null;
          answer_id: string | null;
          changed_by: string | null;
          changed_at: string;
          field: string;
          old_value: Json | null;
          new_value: Json | null;
          reason: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          attempt_id?: string | null;
          answer_id?: string | null;
          changed_by?: string | null;
          changed_at?: string;
          field: string;
          old_value?: Json | null;
          new_value?: Json | null;
          reason: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          attempt_id?: string | null;
          answer_id?: string | null;
          changed_by?: string | null;
          changed_at?: string;
          field?: string;
          old_value?: Json | null;
          new_value?: Json | null;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'grade_changes_answer_id_fkey';
            columns: ['answer_id'];
            isOneToOne: false;
            referencedRelation: 'exam_answers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'grade_changes_attempt_id_fkey';
            columns: ['attempt_id'];
            isOneToOne: false;
            referencedRelation: 'exam_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'grade_changes_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'grade_changes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: Database['public']['Enums']['org_role'];
          course_id: string | null;
          token: string;
          status: Database['public']['Enums']['invitation_status'];
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role?: Database['public']['Enums']['org_role'];
          course_id?: string | null;
          token?: string;
          status?: Database['public']['Enums']['invitation_status'];
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: Database['public']['Enums']['org_role'];
          course_id?: string | null;
          token?: string;
          status?: Database['public']['Enums']['invitation_status'];
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      lesson_completions: {
        Row: {
          id: string;
          organization_id: string;
          lesson_id: string;
          student_id: string;
          completed_at: string;
          course_id: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          lesson_id: string;
          student_id: string;
          completed_at?: string;
          course_id?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          lesson_id?: string;
          student_id?: string;
          completed_at?: string;
          course_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lesson_completions_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lesson_completions_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lesson_completions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lesson_completions_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      lesson_contents: {
        Row: {
          lesson_id: string;
          organization_id: string;
          course_id: string;
          body: string | null;
          video_id: string | null;
          external_url: string | null;
          updated_at: string;
        };
        Insert: {
          lesson_id: string;
          organization_id?: string;
          course_id?: string;
          body?: string | null;
          video_id?: string | null;
          external_url?: string | null;
          updated_at?: string;
        };
        Update: {
          lesson_id?: string;
          organization_id?: string;
          course_id?: string;
          body?: string | null;
          video_id?: string | null;
          external_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lesson_contents_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lesson_contents_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: true;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lesson_contents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      lessons: {
        Row: {
          id: string;
          organization_id: string;
          module_id: string;
          title: string;
          kind: Database['public']['Enums']['lesson_kind'];
          order_index: number;
          is_required: boolean;
          duration_seconds: number | null;
          unlock_after_days: number | null;
          unlock_at: string | null;
          created_at: string;
          updated_at: string;
          exam_id: string | null;
          course_id: string;
          is_preview: boolean;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          module_id: string;
          title: string;
          kind?: Database['public']['Enums']['lesson_kind'];
          order_index?: number;
          is_required?: boolean;
          duration_seconds?: number | null;
          unlock_after_days?: number | null;
          unlock_at?: string | null;
          created_at?: string;
          updated_at?: string;
          exam_id?: string | null;
          course_id?: string;
          is_preview?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          module_id?: string;
          title?: string;
          kind?: Database['public']['Enums']['lesson_kind'];
          order_index?: number;
          is_required?: boolean;
          duration_seconds?: number | null;
          unlock_after_days?: number | null;
          unlock_at?: string | null;
          created_at?: string;
          updated_at?: string;
          exam_id?: string | null;
          course_id?: string;
          is_preview?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'lessons_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lessons_exam_id_fkey';
            columns: ['exam_id'];
            isOneToOne: false;
            referencedRelation: 'exams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lessons_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lessons_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      memberships: {
        Row: {
          user_id: string;
          organization_id: string;
          role: Database['public']['Enums']['org_role'];
          created_at: string;
        };
        Insert: {
          user_id: string;
          organization_id: string;
          role: Database['public']['Enums']['org_role'];
          created_at?: string;
        };
        Update: {
          user_id?: string;
          organization_id?: string;
          role?: Database['public']['Enums']['org_role'];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      modules: {
        Row: {
          id: string;
          organization_id: string;
          course_id: string;
          title: string;
          description: string | null;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          course_id: string;
          title: string;
          description?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          course_id?: string;
          title?: string;
          description?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'modules_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'modules_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          country: string;
          locale: string;
          timezone: string;
          status: Database['public']['Enums']['org_status'];
          custom_domain: string | null;
          logo_url: string | null;
          primary_color: string | null;
          accent_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          country?: string;
          locale?: string;
          timezone?: string;
          status?: Database['public']['Enums']['org_status'];
          custom_domain?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          accent_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          country?: string;
          locale?: string;
          timezone?: string;
          status?: Database['public']['Enums']['org_status'];
          custom_domain?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          accent_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          user_id: string;
          role: Database['public']['Enums']['platform_role'];
          created_at: string;
        };
        Insert: {
          user_id: string;
          role: Database['public']['Enums']['platform_role'];
          created_at?: string;
        };
        Update: {
          user_id?: string;
          role?: Database['public']['Enums']['platform_role'];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_admins_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      question_banks: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          topic: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          topic?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          title?: string;
          topic?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'question_banks_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'question_banks_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      question_keys: {
        Row: {
          question_id: string;
          organization_id: string;
          answer: Json;
          explanation: string | null;
          updated_at: string;
        };
        Insert: {
          question_id: string;
          organization_id?: string;
          answer: Json;
          explanation?: string | null;
          updated_at?: string;
        };
        Update: {
          question_id?: string;
          organization_id?: string;
          answer?: Json;
          explanation?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'question_keys_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'question_keys_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: true;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          },
        ];
      };
      question_options: {
        Row: {
          id: string;
          organization_id: string;
          question_id: string;
          label: string;
          order_index: number;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          question_id: string;
          label: string;
          order_index?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          question_id?: string;
          label?: string;
          order_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'question_options_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'question_options_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          },
        ];
      };
      questions: {
        Row: {
          id: string;
          organization_id: string;
          bank_id: string;
          kind: Database['public']['Enums']['question_kind'];
          prompt: string;
          points: number;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          bank_id: string;
          kind: Database['public']['Enums']['question_kind'];
          prompt: string;
          points?: number;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          bank_id?: string;
          kind?: Database['public']['Enums']['question_kind'];
          prompt?: string;
          points?: number;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'questions_bank_id_fkey';
            columns: ['bank_id'];
            isOneToOne: false;
            referencedRelation: 'question_banks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'questions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      reserved_slugs: {
        Row: {
          slug: string;
        };
        Insert: {
          slug: string;
        };
        Update: {
          slug?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      my_course_progress: {
        Row: {
          course_id: string | null;
          total: number | null;
          completed: number | null;
          percent: number | null;
        };
        Relationships: [];
      };
      my_lesson_availability: {
        Row: {
          lesson_id: string | null;
          course_id: string | null;
          is_open: boolean | null;
          opens_at: string | null;
          reason: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      approve_enrollment_request: {
        Args: {
          _request: string;
        };
        Returns: string;
      };
      can_open_lesson: {
        Args: {
          _lesson: string;
        };
        Returns: boolean;
      };
      can_self_enroll: {
        Args: {
          _course: string;
        };
        Returns: boolean;
      };
      can_study_course: {
        Args: {
          _course: string;
        };
        Returns: boolean;
      };
      can_view_course: {
        Args: {
          _course: string;
        };
        Returns: boolean;
      };
      has_org_role: {
        Args: {
          _org: string;
          _roles: Database['public']['Enums']['org_role'][];
        };
        Returns: boolean;
      };
      is_enrolled_in: {
        Args: {
          _course: string;
        };
        Returns: boolean;
      };
      is_member_of: {
        Args: {
          _org: string;
        };
        Returns: boolean;
      };
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      move_lesson: {
        Args: {
          _lesson: string;
          _target_module: string;
          _position: number;
        };
        Returns: number;
      };
      reorder_lessons: {
        Args: {
          _module: string;
          _ids: string[];
        };
        Returns: number;
      };
      reorder_modules: {
        Args: {
          _course: string;
          _ids: string[];
        };
        Returns: number;
      };
      self_enroll_blocker: {
        Args: {
          _course: string;
        };
        Returns: string;
      };
    };
    CompositeTypes: { [_ in never]: never };
    Enums: {
      attempt_status: 'in_progress' | 'submitted' | 'graded' | 'expired';
      course_release_mode: 'immediate' | 'scheduled' | 'relative';
      course_status: 'draft' | 'published' | 'archived';
      course_visibility: 'private' | 'unlisted' | 'public';
      enrollment_request_status: 'pending' | 'approved' | 'rejected' | 'cancelled';
      enrollment_status: 'active' | 'completed' | 'suspended' | 'cancelled';
      exam_status: 'draft' | 'published' | 'archived';
      invitation_status: 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked';
      lesson_kind: 'video' | 'text' | 'file' | 'audio' | 'embed' | 'live' | 'exam';
      org_role: 'org_admin' | 'instructor' | 'student';
      org_status: 'trial' | 'active' | 'suspended' | 'cancelled';
      platform_role: 'admin' | 'support';
      pricing_kind: 'free' | 'one_time' | 'subscription';
      question_kind: 'multiple_choice' | 'multiple_selection' | 'true_false' | 'short_answer' | 'fill_blank' | 'matching' | 'ordering' | 'numeric' | 'essay';
    };
  };
};

/** Atajos: Row<'courses'>, Insert<'lessons'>, Enum<'org_role'>. */
export type Tables = Database['public']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];
export type Enum<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
