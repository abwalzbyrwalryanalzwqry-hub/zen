// ملف مولَّد — لا تعدّله يدوياً. أعد توليده بـ `npm run gen:types` بعد أي ترحيل.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      account_secrets: {
        Row: {
          must_change_password: boolean;
          password_set_at: string | null;
          password_set_by: string | null;
          recovery_failures: number;
          recovery_hash: string | null;
          recovery_locked_until: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          must_change_password?: boolean;
          password_set_at?: string | null;
          password_set_by?: string | null;
          recovery_failures?: number;
          recovery_hash?: string | null;
          recovery_locked_until?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          must_change_password?: boolean;
          password_set_at?: string | null;
          password_set_by?: string | null;
          recovery_failures?: number;
          recovery_hash?: string | null;
          recovery_locked_until?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      account_usernames: {
        Row: {
          created_at: string;
          user_id: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
          username: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
          username?: string;
        };
        Relationships: [];
      };
      ai_consents: {
        Row: {
          age_13_plus: boolean;
          granted_at: string | null;
          memo_context: boolean;
          recitation_audio: boolean;
          recitation_granted_at: string | null;
          recitation_revoked_at: string | null;
          revoked_at: string | null;
          text_ai: boolean;
          text_ai_granted_at: string | null;
          text_ai_revoked_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          age_13_plus?: boolean;
          granted_at?: string | null;
          memo_context?: boolean;
          recitation_audio?: boolean;
          recitation_granted_at?: string | null;
          recitation_revoked_at?: string | null;
          revoked_at?: string | null;
          text_ai?: boolean;
          text_ai_granted_at?: string | null;
          text_ai_revoked_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          age_13_plus?: boolean;
          granted_at?: string | null;
          memo_context?: boolean;
          recitation_audio?: boolean;
          recitation_granted_at?: string | null;
          recitation_revoked_at?: string | null;
          revoked_at?: string | null;
          text_ai?: boolean;
          text_ai_granted_at?: string | null;
          text_ai_revoked_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_conversations: {
        Row: {
          created_at: string;
          id: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          rating: number | null;
          role: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          rating?: number | null;
          role: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          rating?: number | null;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage_events: {
        Row: {
          created_at: string;
          feature: string;
          id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          feature: string;
          id?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          feature?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      analytics_consents: {
        Row: {
          age_13_plus: boolean;
          granted: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          age_13_plus?: boolean;
          granted?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          age_13_plus?: boolean;
          granted?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      app_owner: {
        Row: {
          id: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          id?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      app_owners: {
        Row: {
          added_at: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      assignments: {
        Row: {
          created_at: string;
          due_date: string;
          from_ayah: number;
          halaqa_id: string | null;
          id: string;
          instructions: string | null;
          kind: string;
          status: string;
          student_id: string;
          surah_name: string;
          teacher_id: string | null;
          to_ayah: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          due_date?: string;
          from_ayah?: number;
          halaqa_id?: string | null;
          id?: string;
          instructions?: string | null;
          kind?: string;
          status?: string;
          student_id: string;
          surah_name: string;
          teacher_id?: string | null;
          to_ayah?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          due_date?: string;
          from_ayah?: number;
          halaqa_id?: string | null;
          id?: string;
          instructions?: string | null;
          kind?: string;
          status?: string;
          student_id?: string;
          surah_name?: string;
          teacher_id?: string | null;
          to_ayah?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          created_at: string;
          halaqa_id: string | null;
          id: string;
          reason: string | null;
          session_date: string;
          status: string;
          student_id: string;
          teacher_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          halaqa_id?: string | null;
          id?: string;
          reason?: string | null;
          session_date?: string;
          status?: string;
          student_id: string;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          halaqa_id?: string | null;
          id?: string;
          reason?: string | null;
          session_date?: string;
          status?: string;
          student_id?: string;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_checkin_attempts: {
        Row: {
          at: string;
          user_id: string;
        };
        Insert: {
          at?: string;
          user_id: string;
        };
        Update: {
          at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      attendance_codes: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string;
          halaqa_id: string;
          id: string;
          issued_by: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at: string;
          halaqa_id: string;
          id?: string;
          issued_by: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string;
          halaqa_id?: string;
          id?: string;
          issued_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_codes_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_rate_events: {
        Row: {
          created_at: string;
          id: number;
          key: string;
          kind: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          key: string;
          kind: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          key?: string;
          kind?: string;
        };
        Relationships: [];
      };
      center_code_failures: {
        Row: {
          at: string;
          user_id: string;
        };
        Insert: {
          at?: string;
          user_id: string;
        };
        Update: {
          at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      center_staff: {
        Row: {
          added_by: string | null;
          center_id: string;
          created_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          added_by?: string | null;
          center_id: string;
          created_at?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          added_by?: string | null;
          center_id?: string;
          created_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "center_staff_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      center_staff_codes: {
        Row: {
          center_id: string;
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          role: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          center_id: string;
          code: string;
          created_at?: string;
          created_by: string;
          expires_at?: string;
          id?: string;
          role: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          center_id?: string;
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          role?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "center_staff_codes_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      center_weekly_sent: {
        Row: {
          center_id: string;
          sent_at: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          center_id: string;
          sent_at?: string;
          user_id: string;
          week_start: string;
        };
        Update: {
          center_id?: string;
          sent_at?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "center_weekly_sent_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      centers: {
        Row: {
          certificate_brand: Json | null;
          city: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          fees_enabled: boolean;
          halaqa_league_enabled: boolean;
          id: string;
          name: string;
          report_identity: Json | null;
          student_dm_enabled: boolean;
          teacher_simple_mode: boolean;
          updated_at: string;
          weekly_summary_enabled: boolean;
        };
        Insert: {
          certificate_brand?: Json | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          fees_enabled?: boolean;
          halaqa_league_enabled?: boolean;
          id?: string;
          name: string;
          report_identity?: Json | null;
          student_dm_enabled?: boolean;
          teacher_simple_mode?: boolean;
          updated_at?: string;
          weekly_summary_enabled?: boolean;
        };
        Update: {
          certificate_brand?: Json | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          fees_enabled?: boolean;
          halaqa_league_enabled?: boolean;
          id?: string;
          name?: string;
          report_identity?: Json | null;
          student_dm_enabled?: boolean;
          teacher_simple_mode?: boolean;
          updated_at?: string;
          weekly_summary_enabled?: boolean;
        };
        Relationships: [];
      };
      certificate_assets: {
        Row: {
          archived: boolean;
          center_id: string;
          created_at: string;
          created_by: string | null;
          data_url: string;
          hash: string;
          height: number | null;
          id: string;
          kind: string;
          label: string | null;
          mime: string;
          signer_name: string | null;
          signer_title: string | null;
          width: number | null;
        };
        Insert: {
          archived?: boolean;
          center_id: string;
          created_at?: string;
          created_by?: string | null;
          data_url: string;
          hash: string;
          height?: number | null;
          id?: string;
          kind: string;
          label?: string | null;
          mime: string;
          signer_name?: string | null;
          signer_title?: string | null;
          width?: number | null;
        };
        Update: {
          archived?: boolean;
          center_id?: string;
          created_at?: string;
          created_by?: string | null;
          data_url?: string;
          hash?: string;
          height?: number | null;
          id?: string;
          kind?: string;
          label?: string | null;
          mime?: string;
          signer_name?: string | null;
          signer_title?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_assets_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          at: string;
          center_id: string | null;
          details: Json;
          entity_id: string | null;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          at?: string;
          center_id?: string | null;
          details?: Json;
          entity_id?: string | null;
          id?: number;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          at?: string;
          center_id?: string | null;
          details?: Json;
          entity_id?: string | null;
          id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_audit_log_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_counters: {
        Row: {
          center_id: string;
          last: number;
          year: number;
        };
        Insert: {
          center_id: string;
          last?: number;
          year: number;
        };
        Update: {
          center_id?: string;
          last?: number;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_counters_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_designs: {
        Row: {
          center_id: string | null;
          created_at: string;
          created_by: string | null;
          design: Json;
          hash: string;
          id: string;
          system_template: string | null;
          template_id: string | null;
          version: number | null;
        };
        Insert: {
          center_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          design: Json;
          hash: string;
          id?: string;
          system_template?: string | null;
          template_id?: string | null;
          version?: number | null;
        };
        Update: {
          center_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          design?: Json;
          hash?: string;
          id?: string;
          system_template?: string | null;
          template_id?: string | null;
          version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_designs_center_fk";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_designs_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "certificate_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_number_prefixes: {
        Row: {
          center_id: string;
          prefix: string;
        };
        Insert: {
          center_id: string;
          prefix: string;
        };
        Update: {
          center_id?: string;
          prefix?: string;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_number_prefixes_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: true;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_public_attempts: {
        Row: {
          at: string;
          found: boolean;
          ip: string;
        };
        Insert: {
          at?: string;
          found?: boolean;
          ip: string;
        };
        Update: {
          at?: string;
          found?: boolean;
          ip?: string;
        };
        Relationships: [];
      };
      certificate_templates: {
        Row: {
          archived: boolean;
          based_on: string | null;
          categories: string[];
          center_id: string;
          created_at: string;
          created_by: string | null;
          current_design_id: string | null;
          description: string | null;
          design: Json;
          halaqa_id: string | null;
          id: string;
          name: string;
          type_key: string | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          archived?: boolean;
          based_on?: string | null;
          categories?: string[];
          center_id: string;
          created_at?: string;
          created_by?: string | null;
          current_design_id?: string | null;
          description?: string | null;
          design: Json;
          halaqa_id?: string | null;
          id?: string;
          name: string;
          type_key?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          archived?: boolean;
          based_on?: string | null;
          categories?: string[];
          center_id?: string;
          created_at?: string;
          created_by?: string | null;
          current_design_id?: string | null;
          description?: string | null;
          design?: Json;
          halaqa_id?: string | null;
          id?: string;
          name?: string;
          type_key?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_templates_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_templates_current_design_fk";
            columns: ["current_design_id"];
            isOneToOne: false;
            referencedRelation: "certificate_designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_templates_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_types: {
        Row: {
          active: boolean;
          category: string;
          center_id: string | null;
          conditions: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          key: string;
          name: string;
          param: string | null;
          sort: number;
          text_kind: string;
          texts: Json | null;
        };
        Insert: {
          active?: boolean;
          category: string;
          center_id?: string | null;
          conditions?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key: string;
          name: string;
          param?: string | null;
          sort?: number;
          text_kind?: string;
          texts?: Json | null;
        };
        Update: {
          active?: boolean;
          category?: string;
          center_id?: string | null;
          conditions?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key?: string;
          name?: string;
          param?: string | null;
          sort?: number;
          text_kind?: string;
          texts?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_types_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_verify_attempts: {
        Row: {
          at: string;
          found: boolean;
          id: number;
          user_id: string;
        };
        Insert: {
          at?: string;
          found: boolean;
          id?: number;
          user_id: string;
        };
        Update: {
          at?: string;
          found?: boolean;
          id?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      certificates: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          archived_at: string | null;
          batch_id: string | null;
          center_id: string | null;
          center_name: string | null;
          certificate_number: string | null;
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          design_id: string | null;
          halaqa_id: string | null;
          halaqa_name: string | null;
          id: string;
          issue_date: string | null;
          issued_at: string | null;
          issued_by: string | null;
          juz: number | null;
          period_from: string | null;
          period_to: string | null;
          replaces_id: string | null;
          review_note: string | null;
          revoke_reason: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          serial: string;
          snapshot: Json | null;
          source: string;
          status: string;
          student_id: string;
          student_name: string;
          system_template: string | null;
          teacher_id: string | null;
          teacher_name: string | null;
          teacher_note: string | null;
          template_id: string | null;
          type_key: string | null;
          updated_at: string;
          verify_code: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          archived_at?: string | null;
          batch_id?: string | null;
          center_id?: string | null;
          center_name?: string | null;
          certificate_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          design_id?: string | null;
          halaqa_id?: string | null;
          halaqa_name?: string | null;
          id?: string;
          issue_date?: string | null;
          issued_at?: string | null;
          issued_by?: string | null;
          juz?: number | null;
          period_from?: string | null;
          period_to?: string | null;
          replaces_id?: string | null;
          review_note?: string | null;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          serial?: string;
          snapshot?: Json | null;
          source?: string;
          status?: string;
          student_id: string;
          student_name: string;
          system_template?: string | null;
          teacher_id?: string | null;
          teacher_name?: string | null;
          teacher_note?: string | null;
          template_id?: string | null;
          type_key?: string | null;
          updated_at?: string;
          verify_code?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          archived_at?: string | null;
          batch_id?: string | null;
          center_id?: string | null;
          center_name?: string | null;
          certificate_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          design_id?: string | null;
          halaqa_id?: string | null;
          halaqa_name?: string | null;
          id?: string;
          issue_date?: string | null;
          issued_at?: string | null;
          issued_by?: string | null;
          juz?: number | null;
          period_from?: string | null;
          period_to?: string | null;
          replaces_id?: string | null;
          review_note?: string | null;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          serial?: string;
          snapshot?: Json | null;
          source?: string;
          status?: string;
          student_id?: string;
          student_name?: string;
          system_template?: string | null;
          teacher_id?: string | null;
          teacher_name?: string | null;
          teacher_note?: string | null;
          template_id?: string | null;
          type_key?: string | null;
          updated_at?: string;
          verify_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "certificates_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_design_fk";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "certificate_designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_replaces_id_fkey";
            columns: ["replaces_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_template_fk";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "certificate_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      challenge_logs: {
        Row: {
          challenge_id: string;
          created_at: string;
          day: string;
          id: string;
          pages: number;
          student_id: string;
        };
        Insert: {
          challenge_id: string;
          created_at?: string;
          day?: string;
          id?: string;
          pages: number;
          student_id: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          day?: string;
          id?: string;
          pages?: number;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "challenge_logs_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "halaqa_challenges";
            referencedColumns: ["id"];
          },
        ];
      };
      challenge_parts: {
        Row: {
          challenge_id: string;
          claimed_at: string;
          claimed_by: string;
          done_at: string | null;
          part: number;
        };
        Insert: {
          challenge_id: string;
          claimed_at?: string;
          claimed_by: string;
          done_at?: string | null;
          part: number;
        };
        Update: {
          challenge_id?: string;
          claimed_at?: string;
          claimed_by?: string;
          done_at?: string | null;
          part?: number;
        };
        Relationships: [
          {
            foreignKeyName: "challenge_parts_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "halaqa_challenges";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_mutes: {
        Row: {
          chat_id: string;
          until: string;
          user_id: string;
        };
        Insert: {
          chat_id: string;
          until: string;
          user_id: string;
        };
        Update: {
          chat_id?: string;
          until?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_mutes_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_reads: {
        Row: {
          chat_id: string;
          last_read_at: string;
          user_id: string;
        };
        Insert: {
          chat_id: string;
          last_read_at?: string;
          user_id: string;
        };
        Update: {
          chat_id?: string;
          last_read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_reads_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
        ];
      };
      chats: {
        Row: {
          created_at: string;
          id: string;
          is_group: boolean;
          last_message: string | null;
          last_sender: string | null;
          participants: string[];
          title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_group?: boolean;
          last_message?: string | null;
          last_sender?: string | null;
          participants: string[];
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_group?: boolean;
          last_message?: string | null;
          last_sender?: string | null;
          participants?: string[];
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      client_errors: {
        Row: {
          created_at: string;
          fingerprint: string;
          id: string;
          last_seen_at: string;
          message: string;
          occurrences: number;
          release: string | null;
          source: string;
          stack: string | null;
          url: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          fingerprint: string;
          id?: string;
          last_seen_at?: string;
          message: string;
          occurrences?: number;
          release?: string | null;
          source?: string;
          stack?: string | null;
          url?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          fingerprint?: string;
          id?: string;
          last_seen_at?: string;
          message?: string;
          occurrences?: number;
          release?: string | null;
          source?: string;
          stack?: string | null;
          url?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      daily_record_audit: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          at: string;
          before: Json | null;
          halaqa_id: string;
          id: number;
          record_date: string;
          record_id: string;
          student_id: string | null;
          txid: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          halaqa_id: string;
          id?: number;
          record_date: string;
          record_id: string;
          student_id?: string | null;
          txid?: number;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          halaqa_id?: string;
          id?: number;
          record_date?: string;
          record_id?: string;
          student_id?: string | null;
          txid?: number;
        };
        Relationships: [
          {
            foreignKeyName: "daily_record_audit_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_record_reviews: {
        Row: {
          at: string;
          note: string | null;
          ok: boolean;
          record_id: string;
          reviewer_id: string | null;
          student_id: string;
        };
        Insert: {
          at?: string;
          note?: string | null;
          ok: boolean;
          record_id: string;
          reviewer_id?: string | null;
          student_id: string;
        };
        Update: {
          at?: string;
          note?: string | null;
          ok?: boolean;
          record_id?: string;
          reviewer_id?: string | null;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_record_reviews_record_id_fkey";
            columns: ["record_id"];
            isOneToOne: false;
            referencedRelation: "halaqa_daily_records";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_wird: {
        Row: {
          created_at: string;
          day: string;
          pages: number | null;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          day: string;
          pages?: number | null;
          student_id: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          pages?: number | null;
          student_id?: string;
        };
        Relationships: [];
      };
      error_alert_runs: {
        Row: {
          created_at: string;
          errors: number;
          hour: string;
          notified: boolean;
          threshold: number;
        };
        Insert: {
          created_at?: string;
          errors: number;
          hour: string;
          notified?: boolean;
          threshold: number;
        };
        Update: {
          created_at?: string;
          errors?: number;
          hour?: string;
          notified?: boolean;
          threshold?: number;
        };
        Relationships: [];
      };
      exam_attempts: {
        Row: {
          answers: Json;
          current_index: number;
          ended_at: string | null;
          exam_id: string;
          id: string;
          started_at: string;
          status: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          answers?: Json;
          current_index?: number;
          ended_at?: string | null;
          exam_id: string;
          id?: string;
          started_at?: string;
          status?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          current_index?: number;
          ended_at?: string | null;
          exam_id?: string;
          id?: string;
          started_at?: string;
          status?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_errors: {
        Row: {
          created_at: string;
          errors: number;
          from_ayah: number;
          id: string;
          result_id: string;
          sent_to_review: boolean;
          student_id: string;
          surah_name: string;
          surah_number: number;
          to_ayah: number;
        };
        Insert: {
          created_at?: string;
          errors?: number;
          from_ayah: number;
          id?: string;
          result_id: string;
          sent_to_review?: boolean;
          student_id: string;
          surah_name: string;
          surah_number: number;
          to_ayah: number;
        };
        Update: {
          created_at?: string;
          errors?: number;
          from_ayah?: number;
          id?: string;
          result_id?: string;
          sent_to_review?: boolean;
          student_id?: string;
          surah_name?: string;
          surah_number?: number;
          to_ayah?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_errors_result_id_fkey";
            columns: ["result_id"];
            isOneToOne: false;
            referencedRelation: "exam_results";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_results: {
        Row: {
          analysis: Json;
          attempt_id: string;
          correct_count: number;
          created_at: string;
          duration_seconds: number;
          exam_id: string;
          id: string;
          mastery: string;
          percentage: number;
          possible: number;
          score: number;
          skipped_count: number;
          student_id: string;
          wrong_count: number;
        };
        Insert: {
          analysis?: Json;
          attempt_id: string;
          correct_count?: number;
          created_at?: string;
          duration_seconds?: number;
          exam_id: string;
          id?: string;
          mastery: string;
          percentage: number;
          possible: number;
          score: number;
          skipped_count?: number;
          student_id: string;
          wrong_count?: number;
        };
        Update: {
          analysis?: Json;
          attempt_id?: string;
          correct_count?: number;
          created_at?: string;
          duration_seconds?: number;
          exam_id?: string;
          id?: string;
          mastery?: string;
          percentage?: number;
          possible?: number;
          score?: number;
          skipped_count?: number;
          student_id?: string;
          wrong_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_results_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: true;
            referencedRelation: "exam_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_results_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      exams: {
        Row: {
          blueprint: Json;
          corpus_sha256: string;
          created_at: string;
          difficulty: string;
          engine_version: string;
          id: string;
          mode: string;
          question_count: number;
          scope: Json;
          scope_label: string;
          seed: string;
          snapshot: Json;
          student_id: string;
          title: string;
        };
        Insert: {
          blueprint: Json;
          corpus_sha256: string;
          created_at?: string;
          difficulty: string;
          engine_version: string;
          id?: string;
          mode: string;
          question_count: number;
          scope: Json;
          scope_label: string;
          seed: string;
          snapshot: Json;
          student_id: string;
          title: string;
        };
        Update: {
          blueprint?: Json;
          corpus_sha256?: string;
          created_at?: string;
          difficulty?: string;
          engine_version?: string;
          id?: string;
          mode?: string;
          question_count?: number;
          scope?: Json;
          scope_label?: string;
          seed?: string;
          snapshot?: Json;
          student_id?: string;
          title?: string;
        };
        Relationships: [];
      };
      family_goals: {
        Row: {
          achieved_at: string | null;
          created_at: string;
          ends_on: string | null;
          guardian_id: string;
          id: string;
          kind: string;
          reward: string | null;
          starts_on: string;
          status: string;
          student_id: string;
          target: number;
          title: string | null;
        };
        Insert: {
          achieved_at?: string | null;
          created_at?: string;
          ends_on?: string | null;
          guardian_id: string;
          id?: string;
          kind: string;
          reward?: string | null;
          starts_on?: string;
          status?: string;
          student_id: string;
          target: number;
          title?: string | null;
        };
        Update: {
          achieved_at?: string | null;
          created_at?: string;
          ends_on?: string | null;
          guardian_id?: string;
          id?: string;
          kind?: string;
          reward?: string | null;
          starts_on?: string;
          status?: string;
          student_id?: string;
          target?: number;
          title?: string | null;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          enabled: boolean;
          key: string;
          note: string | null;
          rollout: number;
          updated_at: string;
        };
        Insert: {
          enabled?: boolean;
          key: string;
          note?: string | null;
          rollout?: number;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          key?: string;
          note?: string | null;
          rollout?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      fee_charges: {
        Row: {
          amount: number;
          cancelled_at: string | null;
          cancelled_by: string | null;
          center_id: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          due_date: string;
          id: string;
          student_id: string;
          title: string;
        };
        Insert: {
          amount: number;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          center_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          due_date: string;
          id?: string;
          student_id: string;
          title: string;
        };
        Update: {
          amount?: number;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          center_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          due_date?: string;
          id?: string;
          student_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_charges_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_payments: {
        Row: {
          amount: number;
          center_id: string;
          created_at: string;
          currency: string;
          id: string;
          method: string;
          note: string | null;
          paid_on: string;
          receipt_id: string | null;
          recorded_by: string | null;
          reference: string | null;
          source: string;
          student_id: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount: number;
          center_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          method?: string;
          note?: string | null;
          paid_on?: string;
          receipt_id?: string | null;
          recorded_by?: string | null;
          reference?: string | null;
          source?: string;
          student_id: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number;
          center_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          method?: string;
          note?: string | null;
          paid_on?: string;
          receipt_id?: string | null;
          recorded_by?: string | null;
          reference?: string | null;
          source?: string;
          student_id?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fee_payments_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_receipts: {
        Row: {
          amount: number;
          center_id: string;
          created_at: string;
          currency: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          image_path: string | null;
          note: string | null;
          payment_id: string | null;
          reference: string | null;
          status: string;
          student_id: string;
          submitted_by: string;
        };
        Insert: {
          amount: number;
          center_id: string;
          created_at?: string;
          currency?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          image_path?: string | null;
          note?: string | null;
          payment_id?: string | null;
          reference?: string | null;
          status?: string;
          student_id: string;
          submitted_by: string;
        };
        Update: {
          amount?: number;
          center_id?: string;
          created_at?: string;
          currency?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          image_path?: string | null;
          note?: string | null;
          payment_id?: string | null;
          reference?: string | null;
          status?: string;
          student_id?: string;
          submitted_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_receipts_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_receipts_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "fee_payments";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_reminders_sent: {
        Row: {
          charge_id: string;
          sent_at: string;
          stage: string;
        };
        Insert: {
          charge_id: string;
          sent_at?: string;
          stage: string;
        };
        Update: {
          charge_id?: string;
          sent_at?: string;
          stage?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_reminders_sent_charge_id_fkey";
            columns: ["charge_id"];
            isOneToOne: false;
            referencedRelation: "fee_charges";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          app_version: string | null;
          created_at: string;
          id: string;
          kind: string;
          locale: string | null;
          message: string;
          platform: string | null;
          route: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          locale?: string | null;
          message: string;
          platform?: string | null;
          route?: string | null;
          status?: string;
          user_id?: string;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          locale?: string | null;
          message?: string;
          platform?: string | null;
          route?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      founder_codes: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          note: string | null;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          note?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          note?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [];
      };
      guardian_ai_consents: {
        Row: {
          granted_at: string | null;
          guardian_id: string;
          recitation_audio: boolean;
          revoked_at: string | null;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          granted_at?: string | null;
          guardian_id: string;
          recitation_audio?: boolean;
          revoked_at?: string | null;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          granted_at?: string | null;
          guardian_id?: string;
          recitation_audio?: boolean;
          revoked_at?: string | null;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      guardian_claim_failures: {
        Row: {
          at: string;
          user_id: string;
        };
        Insert: {
          at?: string;
          user_id: string;
        };
        Update: {
          at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      guardian_link_codes: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          relation: string;
          student_id: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          expires_at?: string;
          id?: string;
          relation?: string;
          student_id: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          relation?: string;
          student_id?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [];
      };
      guardian_links: {
        Row: {
          created_at: string;
          guardian_id: string;
          relation: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          guardian_id: string;
          relation?: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          guardian_id?: string;
          relation?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      guardian_monthly_sent: {
        Row: {
          guardian_id: string;
          month_start: string;
          sent_at: string;
          student_id: string;
        };
        Insert: {
          guardian_id: string;
          month_start: string;
          sent_at?: string;
          student_id: string;
        };
        Update: {
          guardian_id?: string;
          month_start?: string;
          sent_at?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      guardian_weekly_sent: {
        Row: {
          guardian_id: string;
          sent_at: string;
          student_id: string;
          week_start: string;
        };
        Insert: {
          guardian_id: string;
          sent_at?: string;
          student_id: string;
          week_start: string;
        };
        Update: {
          guardian_id?: string;
          sent_at?: string;
          student_id?: string;
          week_start?: string;
        };
        Relationships: [];
      };
      halaqa_challenges: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          ends_on: string;
          halaqa_id: string;
          id: string;
          kind: string;
          starts_on: string;
          target: number;
          title: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_on: string;
          halaqa_id: string;
          id?: string;
          kind: string;
          starts_on: string;
          target: number;
          title: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_on?: string;
          halaqa_id?: string;
          id?: string;
          kind?: string;
          starts_on?: string;
          target?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "halaqa_challenges_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      halaqa_daily_records: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          first_completed_at: string | null;
          halaqa_id: string;
          id: string;
          locked_at: string | null;
          locked_by: string | null;
          notes: string | null;
          opened_by: string | null;
          record_date: string;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          first_completed_at?: string | null;
          halaqa_id: string;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          notes?: string | null;
          opened_by?: string | null;
          record_date: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          first_completed_at?: string | null;
          halaqa_id?: string;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          notes?: string | null;
          opened_by?: string | null;
          record_date?: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "halaqa_daily_records_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      halaqa_honor_board: {
        Row: {
          enabled: boolean;
          halaqa_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled?: boolean;
          halaqa_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          halaqa_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "halaqa_honor_board_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: true;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      halaqa_invites: {
        Row: {
          created_at: string;
          guardian_at: string | null;
          guardian_id: string | null;
          halaqa_id: string;
          id: string;
          invited_by: string;
          responded_at: string | null;
          status: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          guardian_at?: string | null;
          guardian_id?: string | null;
          halaqa_id: string;
          id?: string;
          invited_by: string;
          responded_at?: string | null;
          status?: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          guardian_at?: string | null;
          guardian_id?: string | null;
          halaqa_id?: string;
          id?: string;
          invited_by?: string;
          responded_at?: string | null;
          status?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "halaqa_invites_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      halaqa_register_entries: {
        Row: {
          assessment_id: string | null;
          attendance_id: string | null;
          created_at: string;
          eval_behavior: number | null;
          eval_overall: number | null;
          eval_pronunciation: number | null;
          eval_tajweed: number | null;
          halaqa_id: string;
          note: string | null;
          recitation_session_id: string | null;
          recorded_by: string;
          session_date: string;
          student_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          assessment_id?: string | null;
          attendance_id?: string | null;
          created_at?: string;
          eval_behavior?: number | null;
          eval_overall?: number | null;
          eval_pronunciation?: number | null;
          eval_tajweed?: number | null;
          halaqa_id: string;
          note?: string | null;
          recitation_session_id?: string | null;
          recorded_by: string;
          session_date: string;
          student_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          assessment_id?: string | null;
          attendance_id?: string | null;
          created_at?: string;
          eval_behavior?: number | null;
          eval_overall?: number | null;
          eval_pronunciation?: number | null;
          eval_tajweed?: number | null;
          halaqa_id?: string;
          note?: string | null;
          recitation_session_id?: string | null;
          recorded_by?: string;
          session_date?: string;
          student_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "halaqa_register_entries_assessment_id_fkey";
            columns: ["assessment_id"];
            isOneToOne: false;
            referencedRelation: "recitation_assessments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "halaqa_register_entries_attendance_id_fkey";
            columns: ["attendance_id"];
            isOneToOne: false;
            referencedRelation: "attendance";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "halaqa_register_entries_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "halaqa_register_entries_recitation_session_id_fkey";
            columns: ["recitation_session_id"];
            isOneToOne: false;
            referencedRelation: "recitation_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      halaqa_rooms: {
        Row: {
          consent_required: boolean;
          created_at: string;
          enabled: boolean;
          halaqa_id: string;
          id: string;
          kind: string;
        };
        Insert: {
          consent_required?: boolean;
          created_at?: string;
          enabled?: boolean;
          halaqa_id: string;
          id?: string;
          kind: string;
        };
        Update: {
          consent_required?: boolean;
          created_at?: string;
          enabled?: boolean;
          halaqa_id?: string;
          id?: string;
          kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "halaqa_rooms_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      halaqa_schedule: {
        Row: {
          created_at: string;
          created_by: string | null;
          end_time: string;
          halaqa_id: string;
          id: string;
          location: string | null;
          online_url: string | null;
          start_time: string;
          weekday: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          end_time: string;
          halaqa_id: string;
          id?: string;
          location?: string | null;
          online_url?: string | null;
          start_time: string;
          weekday: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          end_time?: string;
          halaqa_id?: string;
          id?: string;
          location?: string | null;
          online_url?: string | null;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "halaqa_schedule_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      halaqa_students: {
        Row: {
          created_at: string;
          halaqa_id: string;
          id: string;
          memorize_dir: string;
          review_dir: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          halaqa_id: string;
          id?: string;
          memorize_dir?: string;
          review_dir?: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          halaqa_id?: string;
          id?: string;
          memorize_dir?: string;
          review_dir?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "halaqa_students_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      halaqat: {
        Row: {
          center_id: string;
          created_at: string;
          id: string;
          name: string;
          schedule: string | null;
          teacher_id: string | null;
          updated_at: string;
        };
        Insert: {
          center_id: string;
          created_at?: string;
          id?: string;
          name: string;
          schedule?: string | null;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Update: {
          center_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          schedule?: string | null;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "halaqat_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      memorization_plans: {
        Row: {
          created_at: string;
          decided_at: string | null;
          id: string;
          items: Json;
          proposed_by: string | null;
          rationale: string | null;
          status: string;
          student_id: string;
          teacher_id: string | null;
          teacher_note: string | null;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          items: Json;
          proposed_by?: string | null;
          rationale?: string | null;
          status?: string;
          student_id: string;
          teacher_id?: string | null;
          teacher_note?: string | null;
          week_start?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          items?: Json;
          proposed_by?: string | null;
          rationale?: string | null;
          status?: string;
          student_id?: string;
          teacher_id?: string | null;
          teacher_note?: string | null;
          week_start?: string;
        };
        Relationships: [];
      };
      message_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          message_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          message_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          message_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      message_reports: {
        Row: {
          created_at: string;
          id: string;
          message_id: string;
          reason: string | null;
          reporter_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_id: string;
          reason?: string | null;
          reporter_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string;
          reason?: string | null;
          reporter_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "message_reports_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          chat_id: string;
          client_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          duration_seconds: number | null;
          edited_at: string | null;
          id: string;
          media_path: string | null;
          reply_to: string | null;
          sender_id: string;
          status: string;
          type: string;
        };
        Insert: {
          chat_id: string;
          client_id?: string | null;
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          duration_seconds?: number | null;
          edited_at?: string | null;
          id?: string;
          media_path?: string | null;
          reply_to?: string | null;
          sender_id: string;
          status?: string;
          type?: string;
        };
        Update: {
          chat_id?: string;
          client_id?: string | null;
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          duration_seconds?: number | null;
          edited_at?: string | null;
          id?: string;
          media_path?: string | null;
          reply_to?: string | null;
          sender_id?: string;
          status?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_reply_to_fkey";
            columns: ["reply_to"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      muhasaba_days: {
        Row: {
          closed_at: string | null;
          created_at: string;
          day: string;
          focus: string[];
          goal_key: string | null;
          goal_result: string | null;
          goal_text: string | null;
          habits_done: string[];
          id: string;
          mood: string | null;
          note: string | null;
          prayers: Json;
          quran_self: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          day: string;
          focus?: string[];
          goal_key?: string | null;
          goal_result?: string | null;
          goal_text?: string | null;
          habits_done?: string[];
          id?: string;
          mood?: string | null;
          note?: string | null;
          prayers?: Json;
          quran_self?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          day?: string;
          focus?: string[];
          goal_key?: string | null;
          goal_result?: string | null;
          goal_text?: string | null;
          habits_done?: string[];
          id?: string;
          mood?: string | null;
          note?: string | null;
          prayers?: Json;
          quran_self?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      muhasaba_habits: {
        Row: {
          archived_at: string | null;
          created_at: string;
          days: number[] | null;
          id: string;
          paused: boolean;
          position: number;
          preset_key: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          days?: number[] | null;
          id?: string;
          paused?: boolean;
          position?: number;
          preset_key?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          days?: number[] | null;
          id?: string;
          paused?: boolean;
          position?: number;
          preset_key?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      muhasaba_settings: {
        Row: {
          created_at: string;
          onboarded_at: string | null;
          reminder_enabled: boolean;
          reminder_time: string;
          track_prayers: boolean;
          track_quran: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          onboarded_at?: string | null;
          reminder_enabled?: boolean;
          reminder_time?: string;
          track_prayers?: boolean;
          track_quran?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          onboarded_at?: string | null;
          reminder_enabled?: boolean;
          reminder_time?: string;
          track_prayers?: boolean;
          track_quran?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      muhasaba_week_goals: {
        Row: {
          created_at: string;
          goal_key: string | null;
          goal_text: string;
          id: string;
          updated_at: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          goal_key?: string | null;
          goal_text: string;
          id?: string;
          updated_at?: string;
          user_id: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          goal_key?: string | null;
          goal_text?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [];
      };
      mushaf_records: {
        Row: {
          created_at: string;
          halaqa_id: string | null;
          id: string;
          kind: string;
          notes: string | null;
          page: number;
          rating: number | null;
          session_date: string;
          student_id: string;
          teacher_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          halaqa_id?: string | null;
          id?: string;
          kind?: string;
          notes?: string | null;
          page: number;
          rating?: number | null;
          session_date?: string;
          student_id: string;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          halaqa_id?: string | null;
          id?: string;
          kind?: string;
          notes?: string | null;
          page?: number;
          rating?: number | null;
          session_date?: string;
          student_id?: string;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mushaf_records_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      native_push_tokens: {
        Row: {
          created_at: string;
          id: string;
          last_success_at: string | null;
          platform: string;
          private_preview: boolean;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_success_at?: string | null;
          platform: string;
          private_preview?: boolean;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_success_at?: string | null;
          platform?: string;
          private_preview?: boolean;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notification_prefs: {
        Row: {
          categories: Json;
          muhasaba_time: string | null;
          push_enabled: boolean;
          quiet_end: string | null;
          quiet_start: string | null;
          timezone: string;
          updated_at: string;
          user_id: string;
          wird_time: string | null;
        };
        Insert: {
          categories?: Json;
          muhasaba_time?: string | null;
          push_enabled?: boolean;
          quiet_end?: string | null;
          quiet_start?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id: string;
          wird_time?: string | null;
        };
        Update: {
          categories?: Json;
          muhasaba_time?: string | null;
          push_enabled?: boolean;
          quiet_end?: string | null;
          quiet_start?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          wird_time?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          link: string | null;
          read: boolean;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          read?: boolean;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          read?: boolean;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      password_resets_audit: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: number;
          method: string;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: number;
          method: string;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: number;
          method?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profile_contacts: {
        Row: {
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_kind: string | null;
          avatar: string | null;
          created_at: string;
          id: string;
          name: string;
          phone: string | null;
          role: string;
        };
        Insert: {
          account_kind?: string | null;
          avatar?: string | null;
          created_at?: string;
          id: string;
          name?: string;
          phone?: string | null;
          role?: string;
        };
        Update: {
          account_kind?: string | null;
          avatar?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          phone?: string | null;
          role?: string;
        };
        Relationships: [];
      };
      progress: {
        Row: {
          created_at: string;
          feedback: string | null;
          from_ayah: number;
          id: string;
          memorization_type: string;
          notes: string | null;
          rating: number | null;
          reviewed_by: string | null;
          surah_name: string;
          to_ayah: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          feedback?: string | null;
          from_ayah: number;
          id?: string;
          memorization_type?: string;
          notes?: string | null;
          rating?: number | null;
          reviewed_by?: string | null;
          surah_name: string;
          to_ayah: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          feedback?: string | null;
          from_ayah?: number;
          id?: string;
          memorization_type?: string;
          notes?: string | null;
          rating?: number | null;
          reviewed_by?: string | null;
          surah_name?: string;
          to_ayah?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      push_dispatch_state: {
        Row: {
          id: number;
          last_kick_at: string;
        };
        Insert: {
          id?: number;
          last_kick_at?: string;
        };
        Update: {
          id?: number;
          last_kick_at?: string;
        };
        Relationships: [];
      };
      push_outbox: {
        Row: {
          attempts: number;
          body: string | null;
          category: string;
          claimed_at: string | null;
          created_at: string;
          dedupe_key: string | null;
          failed_at: string | null;
          id: string;
          notification_id: string | null;
          send_after: string;
          sent_at: string | null;
          title: string;
          url: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          body?: string | null;
          category: string;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          failed_at?: string | null;
          id?: string;
          notification_id?: string | null;
          send_after?: string;
          sent_at?: string | null;
          title: string;
          url?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          body?: string | null;
          category?: string;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          failed_at?: string | null;
          id?: string;
          notification_id?: string | null;
          send_after?: string;
          sent_at?: string | null;
          title?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_outbox_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_success_at: string | null;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          last_success_at?: string | null;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          last_success_at?: string | null;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      quran_reading_state: {
        Row: {
          bookmarks: Json | null;
          bookmarks_at: string | null;
          history: Json | null;
          history_at: string | null;
          khatmah: Json | null;
          khatmah_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          bookmarks?: Json | null;
          bookmarks_at?: string | null;
          history?: Json | null;
          history_at?: string | null;
          khatmah?: Json | null;
          khatmah_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          bookmarks?: Json | null;
          bookmarks_at?: string | null;
          history?: Json | null;
          history_at?: string | null;
          khatmah?: Json | null;
          khatmah_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      quran_units: {
        Row: {
          first_page: number;
          kind: string;
          last_page: number;
          name: string | null;
          no: number;
        };
        Insert: {
          first_page: number;
          kind: string;
          last_page: number;
          name?: string | null;
          no: number;
        };
        Update: {
          first_page?: number;
          kind?: string;
          last_page?: number;
          name?: string | null;
          no?: number;
        };
        Relationships: [];
      };
      recitation_assessments: {
        Row: {
          ai_confidence: number | null;
          ai_summary: string | null;
          approved: boolean;
          created_at: string;
          errors: Json;
          id: string;
          next_review_date: string | null;
          score: number | null;
          session_id: string;
          student_id: string;
          teacher_id: string | null;
          teacher_notes: string | null;
          updated_at: string;
        };
        Insert: {
          ai_confidence?: number | null;
          ai_summary?: string | null;
          approved?: boolean;
          created_at?: string;
          errors?: Json;
          id?: string;
          next_review_date?: string | null;
          score?: number | null;
          session_id: string;
          student_id: string;
          teacher_id?: string | null;
          teacher_notes?: string | null;
          updated_at?: string;
        };
        Update: {
          ai_confidence?: number | null;
          ai_summary?: string | null;
          approved?: boolean;
          created_at?: string;
          errors?: Json;
          id?: string;
          next_review_date?: string | null;
          score?: number | null;
          session_id?: string;
          student_id?: string;
          teacher_id?: string | null;
          teacher_notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recitation_assessments_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "recitation_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      recitation_sessions: {
        Row: {
          ai_analysis: Json | null;
          ai_score: number | null;
          assignment_id: string | null;
          audio_path: string | null;
          audio_purged_at: string | null;
          created_at: string;
          daily_record_id: string | null;
          duration_seconds: number | null;
          from_ayah: number;
          halaqa_id: string | null;
          id: string;
          kind: string;
          seg_index: number | null;
          session_date: string;
          status: string;
          student_id: string;
          surah_name: string;
          to_ayah: number;
          transcript: string | null;
          updated_at: string;
        };
        Insert: {
          ai_analysis?: Json | null;
          ai_score?: number | null;
          assignment_id?: string | null;
          audio_path?: string | null;
          audio_purged_at?: string | null;
          created_at?: string;
          daily_record_id?: string | null;
          duration_seconds?: number | null;
          from_ayah?: number;
          halaqa_id?: string | null;
          id?: string;
          kind?: string;
          seg_index?: number | null;
          session_date?: string;
          status?: string;
          student_id: string;
          surah_name: string;
          to_ayah?: number;
          transcript?: string | null;
          updated_at?: string;
        };
        Update: {
          ai_analysis?: Json | null;
          ai_score?: number | null;
          assignment_id?: string | null;
          audio_path?: string | null;
          audio_purged_at?: string | null;
          created_at?: string;
          daily_record_id?: string | null;
          duration_seconds?: number | null;
          from_ayah?: number;
          halaqa_id?: string | null;
          id?: string;
          kind?: string;
          seg_index?: number | null;
          session_date?: string;
          status?: string;
          student_id?: string;
          surah_name?: string;
          to_ayah?: number;
          transcript?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recitation_sessions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recitation_sessions_daily_record_id_fkey";
            columns: ["daily_record_id"];
            isOneToOne: false;
            referencedRelation: "halaqa_daily_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recitation_sessions_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      remote_recitations: {
        Row: {
          audio_path: string | null;
          created_at: string;
          due_date: string | null;
          duration_seconds: number | null;
          from_ayah: number;
          grade: number | null;
          halaqa_id: string;
          id: string;
          instructions: string | null;
          kind: string;
          mistakes: Json;
          record_date: string | null;
          reviewed_at: string | null;
          session_id: string | null;
          status: string;
          student_id: string;
          submitted_at: string | null;
          surah_name: string;
          teacher_id: string | null;
          teacher_note: string | null;
          to_ayah: number;
        };
        Insert: {
          audio_path?: string | null;
          created_at?: string;
          due_date?: string | null;
          duration_seconds?: number | null;
          from_ayah: number;
          grade?: number | null;
          halaqa_id: string;
          id?: string;
          instructions?: string | null;
          kind?: string;
          mistakes?: Json;
          record_date?: string | null;
          reviewed_at?: string | null;
          session_id?: string | null;
          status?: string;
          student_id: string;
          submitted_at?: string | null;
          surah_name: string;
          teacher_id?: string | null;
          teacher_note?: string | null;
          to_ayah: number;
        };
        Update: {
          audio_path?: string | null;
          created_at?: string;
          due_date?: string | null;
          duration_seconds?: number | null;
          from_ayah?: number;
          grade?: number | null;
          halaqa_id?: string;
          id?: string;
          instructions?: string | null;
          kind?: string;
          mistakes?: Json;
          record_date?: string | null;
          reviewed_at?: string | null;
          session_id?: string | null;
          status?: string;
          student_id?: string;
          submitted_at?: string | null;
          surah_name?: string;
          teacher_id?: string | null;
          teacher_note?: string | null;
          to_ayah?: number;
        };
        Relationships: [
          {
            foreignKeyName: "remote_recitations_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "remote_recitations_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "recitation_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      review_cards: {
        Row: {
          created_at: string;
          due_date: string;
          ease: number;
          from_ayah: number;
          id: string;
          interval_days: number;
          lapses: number;
          last_reviewed_at: string | null;
          last_score: number | null;
          repetitions: number;
          student_id: string;
          surah_name: string;
          to_ayah: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          due_date?: string;
          ease?: number;
          from_ayah: number;
          id?: string;
          interval_days?: number;
          lapses?: number;
          last_reviewed_at?: string | null;
          last_score?: number | null;
          repetitions?: number;
          student_id: string;
          surah_name: string;
          to_ayah: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          due_date?: string;
          ease?: number;
          from_ayah?: number;
          id?: string;
          interval_days?: number;
          lapses?: number;
          last_reviewed_at?: string | null;
          last_score?: number | null;
          repetitions?: number;
          student_id?: string;
          surah_name?: string;
          to_ayah?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      room_consents: {
        Row: {
          created_at: string;
          granted_by: string;
          halaqa_id: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          granted_by: string;
          halaqa_id: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string;
          halaqa_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_consents_halaqa_id_fkey";
            columns: ["halaqa_id"];
            isOneToOne: false;
            referencedRelation: "halaqat";
            referencedColumns: ["id"];
          },
        ];
      };
      room_hidden_contents: {
        Row: {
          content: string;
          hidden_at: string;
          message_id: string;
        };
        Insert: {
          content: string;
          hidden_at?: string;
          message_id: string;
        };
        Update: {
          content?: string;
          hidden_at?: string;
          message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_hidden_contents_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: true;
            referencedRelation: "room_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      room_messages: {
        Row: {
          content: string | null;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          duration_seconds: number | null;
          hidden_at: string | null;
          id: string;
          kind: string;
          media_path: string | null;
          pinned: boolean;
          room_id: string;
          sender_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          duration_seconds?: number | null;
          hidden_at?: string | null;
          id?: string;
          kind?: string;
          media_path?: string | null;
          pinned?: boolean;
          room_id: string;
          sender_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          duration_seconds?: number | null;
          hidden_at?: string | null;
          id?: string;
          kind?: string;
          media_path?: string | null;
          pinned?: boolean;
          room_id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_messages_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "halaqa_rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      room_mutes: {
        Row: {
          created_at: string;
          muted_by: string | null;
          room_id: string;
          until: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          muted_by?: string | null;
          room_id: string;
          until: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          muted_by?: string | null;
          room_id?: string;
          until?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_mutes_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "halaqa_rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      room_reads: {
        Row: {
          last_read_at: string;
          room_id: string;
          user_id: string;
        };
        Insert: {
          last_read_at?: string;
          room_id: string;
          user_id: string;
        };
        Update: {
          last_read_at?: string;
          room_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_reads_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "halaqa_rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      room_reports: {
        Row: {
          created_at: string;
          id: string;
          message_id: string;
          reason: string | null;
          reporter_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_id: string;
          reason?: string | null;
          reporter_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string;
          reason?: string | null;
          reporter_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "room_reports_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "room_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      room_scheduled_messages: {
        Row: {
          content: string;
          created_at: string;
          error: string | null;
          id: string;
          processed_at: string | null;
          room_id: string;
          scheduled_at: string;
          sender_id: string;
          sent_message_id: string | null;
          status: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          processed_at?: string | null;
          room_id: string;
          scheduled_at: string;
          sender_id: string;
          sent_message_id?: string | null;
          status?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          processed_at?: string | null;
          room_id?: string;
          scheduled_at?: string;
          sender_id?: string;
          sent_message_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_scheduled_messages_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "halaqa_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "room_scheduled_messages_sent_message_id_fkey";
            columns: ["sent_message_id"];
            isOneToOne: false;
            referencedRelation: "room_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      stories: {
        Row: {
          ayat: Json;
          created_at: string;
          id: string;
          intro: string;
          lessons: Json;
          mentions: number | null;
          people: string;
          place: string;
          prophet: string;
          quiz: Json;
          slug: string | null;
          sort_order: number;
          sources: Json;
          timeline: Json;
          title: string;
          ulul_azm: boolean;
          updated_at: string;
          vocabulary: Json;
        };
        Insert: {
          ayat?: Json;
          created_at?: string;
          id?: string;
          intro?: string;
          lessons?: Json;
          mentions?: number | null;
          people?: string;
          place?: string;
          prophet: string;
          quiz?: Json;
          slug?: string | null;
          sort_order?: number;
          sources?: Json;
          timeline?: Json;
          title: string;
          ulul_azm?: boolean;
          updated_at?: string;
          vocabulary?: Json;
        };
        Update: {
          ayat?: Json;
          created_at?: string;
          id?: string;
          intro?: string;
          lessons?: Json;
          mentions?: number | null;
          people?: string;
          place?: string;
          prophet?: string;
          quiz?: Json;
          slug?: string | null;
          sort_order?: number;
          sources?: Json;
          timeline?: Json;
          title?: string;
          ulul_azm?: boolean;
          updated_at?: string;
          vocabulary?: Json;
        };
        Relationships: [];
      };
      story_progress: {
        Row: {
          completed: boolean;
          created_at: string;
          id: string;
          last_step: number;
          quiz_score: number | null;
          story_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          created_at?: string;
          id?: string;
          last_step?: number;
          quiz_score?: number | null;
          story_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed?: boolean;
          created_at?: string;
          id?: string;
          last_step?: number;
          quiz_score?: number | null;
          story_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "story_progress_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
        ];
      };
      student_badges: {
        Row: {
          earned_at: string;
          kind: string;
          no: number;
          student_id: string;
        };
        Insert: {
          earned_at?: string;
          kind: string;
          no: number;
          student_id: string;
        };
        Update: {
          earned_at?: string;
          kind?: string;
          no?: number;
          student_id?: string;
        };
        Relationships: [];
      };
      teacher_code_attempts: {
        Row: {
          failures: number;
          locked_until: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          failures?: number;
          locked_until?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          failures?: number;
          locked_until?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      teacher_invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          note: string | null;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          expires_at?: string;
          id?: string;
          note?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          note?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [];
      };
      usage_daily: {
        Row: {
          count: number;
          day: string;
          event: string;
          platform: string;
        };
        Insert: {
          count?: number;
          day: string;
          event: string;
          platform?: string;
        };
        Update: {
          count?: number;
          day?: string;
          event?: string;
          platform?: string;
        };
        Relationships: [];
      };
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _auth_rate_hit: {
        Args: {
          _kind: string | null;
          _key: string | null;
          _max: number | null;
          _window: string | null;
        };
        Returns: undefined;
      };
      _check_new_password: { Args: { _password: string | null }; Returns: undefined };
      _is_reserved_username: { Args: { _u: string | null }; Returns: boolean };
      _new_recovery_code: { Args: never; Returns: string };
      _normalize_recovery_code: { Args: { _code: string | null }; Returns: string };
      _request_ip: { Args: never; Returns: string };
      _rotate_recovery_code: { Args: { _uid: string | null }; Returns: string };
      _set_auth_password: {
        Args: { _uid: string | null; _password: string | null };
        Returns: undefined;
      };
      activate_teacher_role: { Args: { _code: string | null }; Returns: string };
      ai_access_denial: {
        Args: { _user: string | null; _feature: string | null };
        Returns: string;
      };
      ai_memo_context: { Args: { _user: string | null }; Returns: Json };
      am_app_owner: { Args: never; Returns: boolean };
      app_error_alert_tick: { Args: { _threshold?: number | null }; Returns: Json };
      app_health: { Args: { _days?: number | null }; Returns: Json };
      app_owner_id: { Args: never; Returns: string };
      apply_review: {
        Args: {
          _student_id: string | null;
          _surah_name: string | null;
          _from_ayah: number | null;
          _to_ayah: number | null;
          _score: number | null;
        };
        Returns: { due_date: string; interval_days: number; ease: number; repetitions: number }[];
      };
      are_classmates: { Args: { _a: string | null; _b: string | null }; Returns: boolean };
      are_dm_classmates: { Args: { _a: string | null; _b: string | null }; Returns: boolean };
      at_risk_students: { Args: { _halaqa?: string | null }; Returns: Json };
      audit_sample: { Args: { _halaqa: string | null }; Returns: Json };
      auth_schema_guard: { Args: never; Returns: { table_name: string; column_name: string }[] };
      award_badges: { Args: { _student: string | null }; Returns: number };
      backup_tick: { Args: never; Returns: string };
      can_manage_schedule: {
        Args: { _uid: string | null; _halaqa: string | null };
        Returns: boolean;
      };
      can_post_in_chat: {
        Args: { _chat_id: string | null; _uid: string | null };
        Returns: boolean;
      };
      can_read_chat: { Args: { _chat_id: string | null; _uid: string | null }; Returns: boolean };
      can_read_room: { Args: { _uid: string | null; _room: string | null }; Returns: boolean };
      can_review_message_report: {
        Args: { _report: string | null; _uid: string | null };
        Returns: boolean;
      };
      can_start_chat: { Args: { _a: string | null; _b: string | null }; Returns: boolean };
      can_view_center: { Args: { _uid: string | null; _center: string | null }; Returns: boolean };
      can_view_schedule: {
        Args: { _uid: string | null; _halaqa: string | null };
        Returns: boolean;
      };
      can_view_student_report: {
        Args: { _uid: string | null; _student: string | null };
        Returns: boolean;
      };
      cancel_family_goal: { Args: { _goal: string | null }; Returns: undefined };
      cancel_halaqa_invite: { Args: { _invite: string | null }; Returns: undefined };
      cancel_scheduled_room_message: { Args: { _id: string | null }; Returns: boolean };
      center_dashboard: { Args: { _center: string | null; _days?: number | null }; Returns: Json };
      center_drilldown: { Args: { _center: string | null; _days?: number | null }; Returns: Json };
      center_fee_overview: { Args: { _center: string | null }; Returns: Json };
      center_fee_receipts: {
        Args: { _center: string | null; _status?: string | null };
        Returns: Json;
      };
      center_halaqa_league: {
        Args: { _center: string | null; _days?: number | null };
        Returns: Json;
      };
      center_kpis: { Args: { _center: string | null; _months?: number | null }; Returns: Json };
      center_period_compare: {
        Args: { _center: string | null; _days?: number | null };
        Returns: Json;
      };
      center_record_quality: {
        Args: { _center: string | null; _days?: number | null };
        Returns: Json;
      };
      center_staff_list: {
        Args: { _center: string | null };
        Returns: { user_id: string; name: string; role: string; created_at: string }[];
      };
      center_students: {
        Args: { _center: string | null };
        Returns: { student_id: string; name: string; halaqat: string }[];
      };
      center_teacher_quality: {
        Args: { _center: string | null; _days?: number | null };
        Returns: Json;
      };
      cert_approve: { Args: { _ids: string[] | null }; Returns: Json };
      cert_archive: { Args: { _id: string | null }; Returns: undefined };
      cert_archive_asset: {
        Args: { _id: string | null; _archived?: boolean | null };
        Returns: undefined;
      };
      cert_assets: { Args: { _center: string | null; _ids?: string[] | null }; Returns: Json };
      cert_audit_log: { Args: { _center: string | null; _limit?: number | null }; Returns: Json };
      cert_batch: { Args: { _batch: string | null }; Returns: Json };
      cert_brand: { Args: { _center: string | null }; Returns: Json };
      cert_discard_drafts: { Args: { _batch: string | null }; Returns: number };
      cert_finalize: { Args: { _batch: string | null; _ids?: string[] | null }; Returns: Json };
      cert_get: { Args: { _id: string | null }; Returns: Json };
      cert_get_many: { Args: { _ids: string[] | null }; Returns: Json };
      cert_honor: {
        Args: { _halaqa: string | null; _from: string | null; _to?: string | null };
        Returns: Json;
      };
      cert_issue: { Args: { _payload: Json | null }; Returns: Json };
      cert_list: { Args: { _q?: Json | null }; Returns: Json };
      cert_mark_ready: { Args: { _batch: string | null }; Returns: number };
      cert_reject: { Args: { _ids: string[] | null; _reason: string | null }; Returns: Json };
      cert_revoke: { Args: { _id: string | null; _reason: string | null }; Returns: Json };
      cert_save_asset: { Args: { _center: string | null; _asset: Json | null }; Returns: string };
      cert_save_brand: {
        Args: { _center: string | null; _brand: Json | null };
        Returns: undefined;
      };
      cert_save_template: {
        Args: { _template: Json | null; _publish?: boolean | null };
        Returns: Json;
      };
      cert_save_type: { Args: { _center: string | null; _type: Json | null }; Returns: string };
      cert_stats: { Args: { _center?: string | null; _halaqa?: string | null }; Returns: Json };
      cert_studio_context: { Args: never; Returns: Json };
      cert_template_action: {
        Args: { _id: string | null; _action: string | null; _halaqa?: string | null };
        Returns: string;
      };
      cert_templates: { Args: { _center: string | null }; Returns: Json };
      challenge_for_member: {
        Args: { _challenge: string | null };
        Returns: Database["public"]["Tables"]["halaqa_challenges"]["Row"];
      };
      challenge_part_action: {
        Args: { _challenge: string | null; _part: number | null; _action: string | null };
        Returns: Json;
      };
      change_my_password: {
        Args: { _current: string | null; _new_password: string | null };
        Returns: boolean;
      };
      chat_context: { Args: { _chat_id: string | null }; Returns: Json };
      check_challenge_complete: { Args: { _challenge: string | null }; Returns: undefined };
      check_in: { Args: { _code: string | null }; Returns: Json };
      claim_center_staff_code: { Args: { _code: string | null }; Returns: Json };
      claim_guardian_code: { Args: { _code: string | null }; Returns: Json };
      claim_push_batch: {
        Args: { _limit?: number | null };
        Returns: {
          id: string;
          user_id: string;
          category: string;
          title: string;
          body: string;
          url: string;
          subscriptions: Json;
          notification_id: string;
        }[];
      };
      claim_username: {
        Args: { _username: string | null; _password: string | null };
        Returns: Json;
      };
      clear_daily_attendance: {
        Args: { _record: string | null; _student: string | null; _version: number | null };
        Returns: Json;
      };
      complete_daily_record: {
        Args: { _record: string | null; _version: number | null };
        Returns: Json;
      };
      consume_ai_quota: {
        Args: {
          _user_id: string | null;
          _feature: string | null;
          _daily_limit: number | null;
          _minute_limit: number | null;
        };
        Returns: Json;
      };
      create_backup_snapshot: { Args: never; Returns: Json };
      create_center_staff_code: {
        Args: { _center: string | null; _role?: string | null };
        Returns: Json;
      };
      create_guardian_code: {
        Args: { _student: string | null; _relation?: string | null };
        Returns: Json;
      };
      create_teacher_invite: { Args: { _note?: string | null }; Returns: string };
      daily_record_anomalies: {
        Args: { _halaqa: string | null; _days?: number | null };
        Returns: Json;
      };
      daily_record_audit_list: {
        Args: { _halaqa?: string | null; _student?: string | null; _limit?: number | null };
        Returns: Json;
      };
      daily_record_history: {
        Args: { _halaqa: string | null; _before?: string | null; _limit?: number | null };
        Returns: Json;
      };
      daily_record_sheet: { Args: { _halaqa: string | null; _date: string | null }; Returns: Json };
      daily_record_trash_list: { Args: { _halaqa: string | null }; Returns: Json };
      daily_record_week: { Args: { _halaqa: string | null; _to: string | null }; Returns: Json };
      decide_certificate: {
        Args: { _id: string | null; _approve: boolean | null; _note?: string | null };
        Returns: Json;
      };
      decide_memorization_plan: {
        Args: {
          _plan: string | null;
          _approve: boolean | null;
          _note?: string | null;
          _items?: Json | null;
        };
        Returns: undefined;
      };
      delete_daily_record: {
        Args: { _record: string | null; _version: number | null };
        Returns: Json;
      };
      delete_message: { Args: { _id: string | null }; Returns: undefined };
      delete_my_account: { Args: { _confirm: string | null }; Returns: undefined };
      delete_my_account_check: { Args: { _confirm: string | null }; Returns: undefined };
      delete_room_message: { Args: { _id: string | null }; Returns: undefined };
      discussion_settings: { Args: { _halaqa: string | null }; Returns: Json };
      due_reviews: {
        Args: { _limit?: number | null };
        Returns: Database["public"]["Tables"]["review_cards"]["Row"][];
      };
      edit_message: { Args: { _id: string | null; _content: string | null }; Returns: undefined };
      enqueue_daily_reminders: { Args: { _now?: string | null }; Returns: number };
      error_summary: {
        Args: { _days?: number | null };
        Returns: {
          message: string;
          url: string;
          source: string;
          occurrences: number;
          users: number;
          last_seen: string;
        }[];
      };
      export_my_data: { Args: never; Returns: Json };
      family_goal_progress: {
        Args: { _g: Database["public"]["Tables"]["family_goals"]["Row"] | null };
        Returns: number;
      };
      family_goals_for: { Args: { _student: string | null }; Returns: Json };
      fee_add_charges: {
        Args: {
          _center: string | null;
          _students: string[] | null;
          _title: string | null;
          _amount: number | null;
          _due: string | null;
          _currency?: string | null;
        };
        Returns: number;
      };
      fee_cancel_charge: { Args: { _id: string | null }; Returns: undefined };
      fee_decide_receipt: {
        Args: { _id: string | null; _confirm: boolean | null; _note: string | null };
        Returns: Json;
      };
      fee_record_payment: {
        Args: {
          _center: string | null;
          _student: string | null;
          _amount: number | null;
          _method: string | null;
          _reference: string | null;
          _note: string | null;
          _paid_on: string | null;
        };
        Returns: string;
      };
      fee_submit_receipt: {
        Args: {
          _center: string | null;
          _student: string | null;
          _amount: number | null;
          _reference: string | null;
          _image_path: string | null;
          _note: string | null;
        };
        Returns: string;
      };
      fee_void_payment: { Args: { _id: string | null }; Returns: undefined };
      finish_push: {
        Args: { _id: string | null; _delivered: string[] | null; _gone: string[] | null };
        Returns: undefined;
      };
      founder_code_for_me: { Args: never; Returns: Json };
      get_or_create_direct_chat: { Args: { _peer: string | null }; Returns: string };
      grade_to_score: { Args: { _grade: number | null }; Returns: number };
      guardian_ai_consents_list: {
        Args: never;
        Returns: {
          student_id: string;
          recitation_audio: boolean;
          student_consent: boolean;
          updated_at: string;
        }[];
      };
      guardian_approve_invite: {
        Args: { _invite: string | null; _approve: boolean | null };
        Returns: string;
      };
      guardian_child_overview: { Args: { _student: string | null }; Returns: Json };
      guardian_meets_teacher: {
        Args: { _guardian: string | null; _teacher: string | null };
        Returns: boolean;
      };
      guardian_pending_invites: { Args: never; Returns: Json };
      guardian_room_consents: { Args: never; Returns: Json };
      guardian_today_queue: { Args: { _student: string | null }; Returns: Json };
      halaqa_challenges_view: { Args: { _halaqa: string | null }; Returns: Json };
      halaqa_honor_board: { Args: { _halaqa: string | null }; Returns: Json };
      halaqa_register_sheet: {
        Args: { _halaqa: string | null; _date: string | null };
        Returns: Json;
      };
      halaqa_report_data: {
        Args: {
          _halaqa: string | null;
          _from: string | null;
          _to: string | null;
          _students?: string[] | null;
          _weekdays?: number[] | null;
          _history?: boolean | null;
        };
        Returns: Json;
      };
      has_contact_info: { Args: { _t: string | null }; Returns: boolean };
      has_recitation_ai_consent: { Args: { _user: string | null }; Returns: boolean };
      has_role: {
        Args: { _user_id: string | null; _role: Database["public"]["Enums"]["app_role"] | null };
        Returns: boolean;
      };
      invite_to_halaqa: {
        Args: { _halaqa: string | null; _student: string | null };
        Returns: string;
      };
      is_app_owner: { Args: never; Returns: boolean };
      is_blocked_between: { Args: { _a: string | null; _b: string | null }; Returns: boolean };
      is_chat_participant: {
        Args: { _chat_id: string | null; _user_id: string | null };
        Returns: boolean;
      };
      is_guardian_of: {
        Args: { _guardian: string | null; _student: string | null };
        Returns: boolean;
      };
      is_halaqa_member: { Args: { _uid: string | null; _halaqa: string | null }; Returns: boolean };
      is_room_moderator: {
        Args: { _uid: string | null; _halaqa: string | null };
        Returns: boolean;
      };
      is_student_pair_chat: { Args: { _chat_id: string | null }; Returns: boolean };
      is_teacher: { Args: { _uid: string | null }; Returns: boolean };
      is_valid_username: { Args: { _u: string | null }; Returns: boolean };
      issue_attendance_code: { Args: { _halaqa: string | null }; Returns: Json };
      issue_founder_code: {
        Args: { _note?: string | null; _valid_days?: number | null };
        Returns: string;
      };
      lock_daily_record: {
        Args: { _record: string | null; _version: number | null };
        Returns: Json;
      };
      log_challenge_pages: {
        Args: { _challenge: string | null; _pages: number | null };
        Returns: Json;
      };
      log_client_error: {
        Args: {
          _message: string | null;
          _stack?: string | null;
          _url?: string | null;
          _user_agent?: string | null;
          _release?: string | null;
          _source?: string | null;
        };
        Returns: boolean;
      };
      maintenance_tick: { Args: never; Returns: string };
      manages_center: { Args: { _uid: string | null; _center: string | null }; Returns: boolean };
      manages_halaqa: { Args: { _uid: string | null; _halaqa: string | null }; Returns: boolean };
      mark_attendance: {
        Args: {
          _student_id: string | null;
          _halaqa_id: string | null;
          _session_date: string | null;
          _status: string | null;
          _reason?: string | null;
        };
        Returns: string;
      };
      mark_chat_seen: { Args: { _chat_id: string | null }; Returns: number };
      mark_room_read: { Args: { _room: string | null }; Returns: undefined };
      moderators_of: { Args: { _user: string | null }; Returns: string[] };
      monthly_summary_text: {
        Args: { _student: string | null; _month: string | null };
        Returns: string;
      };
      more_badges: { Args: never; Returns: Json };
      mute_room_member: {
        Args: { _room: string | null; _user: string | null; _hours: number | null };
        Returns: undefined;
      };
      my_achievement_halaqat: {
        Args: never;
        Returns: {
          halaqa_id: string;
          halaqa_name: string;
          honor_board: boolean;
          active_challenges: number;
        }[];
      };
      my_ai_consent: { Args: never; Returns: Json };
      my_ai_usage: { Args: { _feature?: string | null }; Returns: number };
      my_analytics_consent: { Args: never; Returns: Json };
      my_chat_contacts: { Args: never; Returns: string[] };
      my_chat_contacts_detailed: { Args: never; Returns: Json };
      my_fee_centers: { Args: never; Returns: Json };
      my_guardian_children: {
        Args: never;
        Returns: { student_id: string; name: string; relation: string; linked_at: string }[];
      };
      my_halaqa_leagues: { Args: { _days?: number | null }; Returns: Json };
      my_halaqa_schedule: {
        Args: never;
        Returns: {
          slot_id: string;
          halaqa_id: string;
          halaqa_name: string;
          center_name: string;
          teacher_name: string;
          weekday: number;
          start_time: string;
          end_time: string;
          location: string;
          online_url: string;
          as_role: string;
          child_name: string;
        }[];
      };
      my_halaqa_student_ids: { Args: never; Returns: string[] };
      my_home_context: { Args: never; Returns: Json };
      my_inbox: { Args: never; Returns: Json };
      my_login_info: { Args: never; Returns: Json };
      my_managed_centers: {
        Args: never;
        Returns: { center_id: string; name: string; city: string; role: string }[];
      };
      my_pending_certificates: {
        Args: never;
        Returns: {
          id: string;
          student_id: string;
          student_name: string;
          juz: number;
          halaqa_name: string;
          created_at: string;
        }[];
      };
      my_remote_recitations: { Args: never; Returns: Json };
      my_room_voice_allowed: { Args: { _room: string | null }; Returns: boolean };
      my_rooms: { Args: never; Returns: Json };
      my_storage_objects: { Args: never; Returns: { bucket_id: string; name: string }[] };
      my_today_queue: { Args: never; Returns: Json };
      normalize_ar: { Args: { _t: string | null }; Returns: string };
      normalize_role_code: { Args: { _code: string | null }; Returns: string };
      normalize_username: { Args: { _raw: string | null }; Returns: string };
      notify_guardians: {
        Args: {
          _student: string | null;
          _kind: string | null;
          _title: string | null;
          _body: string | null;
        };
        Returns: undefined;
      };
      open_daily_record: { Args: { _halaqa: string | null; _date: string | null }; Returns: Json };
      open_message_reports: { Args: never; Returns: Json };
      owns_center: { Args: { _uid: string | null; _center: string | null }; Returns: boolean };
      pin_room_message: {
        Args: { _id: string | null; _pinned: boolean | null };
        Returns: undefined;
      };
      post_room_message: {
        Args: { _room: string | null; _content: string | null };
        Returns: string;
      };
      post_room_voice: {
        Args: { _room: string | null; _path: string | null; _seconds: number | null };
        Returns: string;
      };
      progress_stats: { Args: { _user: string | null }; Returns: Json };
      propose_memorization_plan: {
        Args: {
          _student: string | null;
          _items: Json | null;
          _rationale?: string | null;
          _week_start?: string | null;
        };
        Returns: string;
      };
      purge_old_record_audit: { Args: { _days?: number | null }; Returns: Json };
      push_allowed: { Args: { _user: string | null; _category: string | null }; Returns: boolean };
      push_category: { Args: { _kind: string | null }; Returns: string };
      push_dispatch_tick: { Args: never; Returns: string };
      push_kick_allowed: { Args: { _user: string | null }; Returns: boolean };
      push_release_at: { Args: { _user: string | null; _at: string | null }; Returns: string };
      rate_ai_message: { Args: { _id: string | null; _rating: number | null }; Returns: undefined };
      record_halaqa_session: {
        Args: { _halaqa: string | null; _date: string | null; _rows: Json | null };
        Returns: Json;
      };
      redeem_teacher_invite: { Args: { _code: string | null }; Returns: boolean };
      refund_ai_quota: {
        Args: { _user_id: string | null; _feature: string | null };
        Returns: undefined;
      };
      regenerate_recovery_code: { Args: { _password: string | null }; Returns: string };
      register_username_account: {
        Args: { _username: string | null; _password: string | null; _name?: string | null };
        Returns: Json;
      };
      remote_assign: {
        Args: {
          _halaqa: string | null;
          _students: string[] | null;
          _kind: string | null;
          _surah: string | null;
          _from: number | null;
          _to: number | null;
          _instructions: string | null;
          _due: string | null;
        };
        Returns: number;
      };
      remote_cancel: { Args: { _id: string | null }; Returns: undefined };
      remote_review: {
        Args: {
          _id: string | null;
          _grade: number | null;
          _mistakes: Json | null;
          _note: string | null;
        };
        Returns: Json;
      };
      remote_submit: {
        Args: { _id: string | null; _path: string | null; _seconds: number | null };
        Returns: undefined;
      };
      remove_native_push_token: { Args: { _token: string | null }; Returns: undefined };
      remove_push_subscription: { Args: { _endpoint: string | null }; Returns: undefined };
      reopen_daily_record: {
        Args: { _record: string | null; _version: number | null };
        Returns: Json;
      };
      report_identity: { Args: { _halaqa: string | null }; Returns: Json };
      report_message: { Args: { _id: string | null; _reason: string | null }; Returns: undefined };
      report_room_message: {
        Args: { _id: string | null; _reason?: string | null };
        Returns: undefined;
      };
      reset_password_with_recovery_code: {
        Args: { _username: string | null; _code: string | null; _new_password: string | null };
        Returns: Json;
      };
      resolve_message_report: { Args: { _report: string | null }; Returns: undefined };
      resolve_room_reports: {
        Args: { _message: string | null; _delete: boolean | null };
        Returns: undefined;
      };
      respond_halaqa_invite: {
        Args: { _invite: string | null; _accept: boolean | null };
        Returns: string;
      };
      restore_daily_record: { Args: { _trash: string | null }; Returns: Json };
      retention_audio_candidates: {
        Args: { _days?: number | null; _limit?: number | null };
        Returns: { id: string; audio_path: string }[];
      };
      retention_mark_purged: { Args: { _ids: string[] | null }; Returns: number };
      retention_paths_present: { Args: { _paths: string[] | null }; Returns: string[] };
      review_audit_sample: {
        Args: {
          _record: string | null;
          _student: string | null;
          _ok: boolean | null;
          _note?: string | null;
        };
        Returns: Json;
      };
      room_info: { Args: { _room: string | null }; Returns: Json };
      room_mention_candidates: { Args: { _room: string | null }; Returns: Json };
      room_messages_page: {
        Args: { _room: string | null; _before?: string | null; _limit?: number | null };
        Returns: Json;
      };
      room_open_reports: { Args: { _room: string | null }; Returns: Json };
      room_read_stats: { Args: { _room: string | null }; Returns: Json };
      room_role: { Args: { _uid: string | null; _room: string | null }; Returns: string };
      room_schedule_tick: { Args: { _limit?: number | null }; Returns: Json };
      room_scheduled_list: { Args: { _room: string | null }; Returns: Json };
      save_daily_entry: {
        Args: {
          _record: string | null;
          _student: string | null;
          _payload: Json | null;
          _version: number | null;
        };
        Returns: Json;
      };
      save_native_push_token: {
        Args: { _token: string | null; _platform: string | null };
        Returns: undefined;
      };
      save_push_subscription: {
        Args: {
          _endpoint: string | null;
          _p256dh: string | null;
          _auth: string | null;
          _user_agent?: string | null;
        };
        Returns: undefined;
      };
      schedule_room_message: {
        Args: { _room: string | null; _content: string | null; _at: string | null };
        Returns: string;
      };
      search_my_messages: {
        Args: { _q: string | null; _limit?: number | null };
        Returns: Database["public"]["Tables"]["messages"]["Row"][];
      };
      send_center_weekly_summaries: { Args: never; Returns: number };
      send_exam_errors_to_review: { Args: { _result_id: string | null }; Returns: number };
      send_fee_reminders: { Args: never; Returns: number };
      send_guardian_monthly_reports: { Args: { _month?: string | null }; Returns: number };
      send_guardian_weekly_reports: { Args: never; Returns: number };
      send_test_push: { Args: { _title: string | null; _body: string | null }; Returns: undefined };
      set_account_kind: { Args: { _kind: string | null }; Returns: undefined };
      set_ai_consent: { Args: { _memo_context: boolean | null }; Returns: Json };
      set_analytics_consent: {
        Args: { _granted: boolean | null; _age_13_plus?: boolean | null };
        Returns: Json;
      };
      set_center_chat_settings: {
        Args: { _center: string | null; _student_dm_enabled: boolean | null };
        Returns: undefined;
      };
      set_center_fees_enabled: {
        Args: { _center: string | null; _on: boolean | null };
        Returns: undefined;
      };
      set_center_halaqa_league: {
        Args: { _center: string | null; _on: boolean | null };
        Returns: undefined;
      };
      set_center_teacher_simple_mode: {
        Args: { _center: string | null; _on: boolean | null };
        Returns: undefined;
      };
      set_center_weekly_summary: {
        Args: { _center: string | null; _on: boolean | null };
        Returns: undefined;
      };
      set_chat_mute: { Args: { _chat_id: string | null; _hours: number | null }; Returns: string };
      set_daily_attendance: {
        Args: {
          _record: string | null;
          _student: string | null;
          _status: string | null;
          _reason: string | null;
          _version: number | null;
        };
        Returns: Json;
      };
      set_daily_attendance_bulk: {
        Args: { _record: string | null; _rows: Json | null };
        Returns: Json;
      };
      set_daily_record_notes: {
        Args: { _record: string | null; _notes: string | null; _version: number | null };
        Returns: Json;
      };
      set_discussion: {
        Args: {
          _halaqa: string | null;
          _enabled: boolean | null;
          _consent_required?: boolean | null;
        };
        Returns: string;
      };
      set_family_goal: {
        Args: {
          _student: string | null;
          _kind: string | null;
          _target: number | null;
          _title?: string | null;
          _reward?: string | null;
          _ends_on?: string | null;
        };
        Returns: string;
      };
      set_feature_flag: {
        Args: {
          _key: string | null;
          _enabled: boolean | null;
          _rollout?: number | null;
          _note?: string | null;
        };
        Returns: Database["public"]["Tables"]["feature_flags"]["Row"];
      };
      set_guardian_recitation_consent: {
        Args: { _student: string | null; _on: boolean | null };
        Returns: boolean;
      };
      set_honor_board: {
        Args: { _halaqa: string | null; _enabled: boolean | null };
        Returns: undefined;
      };
      set_my_timezone: { Args: { _timezone: string | null }; Returns: string };
      set_native_push_private: {
        Args: { _token: string | null; _private: boolean | null };
        Returns: boolean;
      };
      set_notification_prefs: {
        Args: {
          _push_enabled: boolean | null;
          _categories: Json | null;
          _quiet_start: string | null;
          _quiet_end: string | null;
          _timezone: string | null;
          _wird_time: string | null;
          _muhasaba_time: string | null;
        };
        Returns: undefined;
      };
      set_recitation_ai_consent:
        | { Args: { _on: boolean | null }; Returns: Json }
        | { Args: { _on: boolean | null; _age_13_plus: boolean | null }; Returns: Json };
      set_report_identity: {
        Args: { _halaqa: string | null; _identity: Json | null };
        Returns: undefined;
      };
      set_room_consent: {
        Args: { _halaqa: string | null; _student: string | null; _allow: boolean | null };
        Returns: undefined;
      };
      set_text_ai_consent: {
        Args: { _on: boolean | null; _age_13_plus: boolean | null };
        Returns: Json;
      };
      set_user_block: {
        Args: { _user: string | null; _blocked: boolean | null };
        Returns: undefined;
      };
      sm2_quality: { Args: { _score: number | null }; Returns: number };
      storage_folder_uuid: { Args: { _name: string | null }; Returns: string };
      storage_usage: { Args: never; Returns: Json };
      streak_of: { Args: { _student: string | null }; Returns: Json };
      strip_room_mentions: { Args: { _text: string | null }; Returns: string };
      student_achievements: { Args: { _student: string | null }; Returns: Json };
      student_activity_days: {
        Args: { _student: string | null; _since: string | null };
        Returns: { day: string }[];
      };
      student_daily_overview: { Args: { _student: string | null }; Returns: Json };
      student_fee_statement: { Args: { _student: string | null }; Returns: Json };
      student_guardians: {
        Args: { _student: string | null };
        Returns: { guardian_id: string; name: string; relation: string; linked_at: string }[];
      };
      student_login_info: { Args: { _student: string | null }; Returns: Json };
      student_report: {
        Args: { _student: string | null; _from: string | null; _to: string | null };
        Returns: Json;
      };
      supervised_chats: { Args: never; Returns: Json };
      supervises_chat: { Args: { _chat_id: string | null; _uid: string | null }; Returns: boolean };
      sync_quran_state: {
        Args: {
          _bookmarks?: Json | null;
          _bookmarks_at?: string | null;
          _khatmah?: Json | null;
          _khatmah_at?: string | null;
          _history?: Json | null;
          _history_at?: string | null;
        };
        Returns: Json;
      };
      teacher_create_student: {
        Args: {
          _halaqa: string | null;
          _username: string | null;
          _password: string | null;
          _name: string | null;
        };
        Returns: Json;
      };
      teacher_create_students_bulk: {
        Args: { _halaqa: string | null; _rows: Json | null };
        Returns: Json;
      };
      teacher_home_kpis: { Args: never; Returns: Json };
      teacher_remote_queue: { Args: never; Returns: Json };
      teacher_remove_student: {
        Args: { _student: string | null; _halaqa?: string | null };
        Returns: number;
      };
      teacher_set_student_password: {
        Args: { _student: string | null; _new_password: string | null };
        Returns: Json;
      };
      teacher_student_week: {
        Args: { _student: string | null; _days?: number | null };
        Returns: Json;
      };
      teacher_update_student: {
        Args: { _student: string | null; _name: string | null };
        Returns: Json;
      };
      teachers_share_center: { Args: { _a: string | null; _b: string | null }; Returns: boolean };
      teaches_student: {
        Args: { _teacher: string | null; _student: string | null };
        Returns: boolean;
      };
      today_queue_for: { Args: { _uid: string | null }; Returns: Json };
      toggle_reaction: { Args: { _id: string | null; _emoji: string | null }; Returns: boolean };
      track_usage: {
        Args: { _events: string[] | null; _platform?: string | null };
        Returns: number;
      };
      unit_label: { Args: { _kind: string | null; _no: number | null }; Returns: string };
      unread_counts: { Args: never; Returns: { chat_id: string; unread: number }[] };
      unread_total: { Args: never; Returns: number };
      usage_events_allowed: { Args: never; Returns: string[] };
      usage_summary: { Args: { _days?: number | null }; Returns: Json };
      username_email: { Args: { _u: string | null }; Returns: string };
      valid_plan_items: { Args: { _items: Json | null }; Returns: boolean };
      verify_certificate: { Args: { _code: string | null }; Returns: Json };
      verify_certificate_public: { Args: { _code: string | null }; Returns: Json };
      visible_phone: { Args: { _user_id: string | null }; Returns: string };
      weekly_summary_text: { Args: { _student: string | null }; Returns: string };
      zen_today: { Args: never; Returns: string };
    };
    Enums: {
      app_role: "student" | "teacher";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["student", "teacher"],
    },
  },
} as const;
