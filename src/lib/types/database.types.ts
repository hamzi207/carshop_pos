export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_fkey"
            columns: ["tenant_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_address: string | null
          cnic_or_ntn: string | null
          contact_person: string | null
          credit_days: number
          created_at: string
          customer_type: string
          default_discount_percentage: number
          email: string | null
          id: string
          is_walk_in: boolean
          name: string
          notes: string | null
          phone: string | null
          strn: string | null
          tax_registration_status: string
          tenant_id: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          billing_address?: string | null
          cnic_or_ntn?: string | null
          contact_person?: string | null
          credit_days?: number
          created_at?: string
          customer_type?: string
          default_discount_percentage?: number
          email?: string | null
          id?: string
          is_walk_in?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          strn?: string | null
          tax_registration_status?: string
          tenant_id: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          billing_address?: string | null
          cnic_or_ntn?: string | null
          contact_person?: string | null
          credit_days?: number
          created_at?: string
          customer_type?: string
          default_discount_percentage?: number
          email?: string | null
          id?: string
          is_walk_in?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          strn?: string | null
          tax_registration_status?: string
          tenant_id?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          metadata: Json
          recipient: string
          resend_id: string | null
          sent_by: string | null
          status: string
          subject: string
          template: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          recipient: string
          resend_id?: string | null
          sent_by?: string | null
          status: string
          subject: string
          template: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          recipient?: string
          resend_id?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          template?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          available_quantity: number
          category_id: string
          cost_price: number
          created_at: string
          description: string | null
          id: string
          is_low_stock: boolean
          is_universal: boolean
          low_stock_threshold: number
          name: string
          price_includes_tax: boolean
          quantity_on_hand: number
          reserved_quantity: number
          selling_price: number
          sku: string
          tenant_id: string
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          available_quantity?: never
          category_id: string
          cost_price: number
          created_at?: string
          description?: string | null
          id?: string
          is_low_stock?: never
          is_universal?: boolean
          low_stock_threshold?: number
          name: string
          price_includes_tax?: boolean
          quantity_on_hand?: number
          reserved_quantity?: number
          selling_price: number
          sku: string
          tenant_id: string
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          available_quantity?: never
          category_id?: string
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_low_stock?: never
          is_universal?: boolean
          low_stock_threshold?: number
          name?: string
          price_includes_tax?: boolean
          quantity_on_hand?: number
          reserved_quantity?: number
          selling_price?: number
          sku?: string
          tenant_id?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_fkey"
            columns: ["tenant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          item_id: string | null
          payment_id: string
          quantity: number | null
          quote_id: string
          quote_item_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          payment_id: string
          quantity?: number | null
          quote_id: string
          quote_item_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          payment_id?: string
          quantity?: number | null
          quote_id?: string
          quote_item_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "invoice_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_items_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_on: string
          payment_method: string
          quote_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_on?: string
          payment_method: string
          quote_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_on?: string
          payment_method?: string
          quote_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_vehicle_compatibility: {
        Row: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          tenant_id: string
          vehicle_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          tenant_id: string
          vehicle_id: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          tenant_id?: string
          vehicle_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_vehicle_compatibility_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_vehicle_compatibility_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_vehicle_compatibility_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          dashboard_prefs: Json
          email: string
          full_name: string
          id: string
          is_superadmin: boolean
          role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dashboard_prefs?: Json
          email: string
          full_name: string
          id: string
          is_superadmin?: boolean
          role?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dashboard_prefs?: Json
          email?: string
          full_name?: string
          id?: string
          is_superadmin?: boolean
          role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          deducted_qty: number
          description: string
          discount_amount: number
          discount_type: string
          discount_value: number
          id: string
          is_labor: boolean
          item_id: string | null
          price_includes_tax: boolean
          quantity: number
          quote_id: string
          reserved_qty: number
          sale_price: number
          sort_order: number
          tenant_id: string
          total_price: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          deducted_qty?: number
          description: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_labor?: boolean
          item_id?: string | null
          price_includes_tax?: boolean
          quantity?: number
          quote_id: string
          reserved_qty?: number
          sale_price?: number
          sort_order?: number
          tenant_id: string
          total_price?: number
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          deducted_qty?: number
          description?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_labor?: boolean
          item_id?: string | null
          price_includes_tax?: boolean
          quantity?: number
          quote_id?: string
          reserved_qty?: number
          sale_price?: number
          sort_order?: number
          tenant_id?: string
          total_price?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          custom_vehicle_notes: string | null
          customer_id: string
          discount_amount: number
          discount_reason: string | null
          discount_type: string
          discount_value: number
          draft_number: string | null
          due_date: string | null
          id: string
          inventory_deducted: boolean
          invoice_number: string | null
          invoiced_at: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_notes: string | null
          quotation_number: string | null
          quote_number: string
          quoted_at: string | null
          share_token: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          vehicle_id: number | null
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          custom_vehicle_notes?: string | null
          customer_id: string
          discount_amount?: number
          discount_reason?: string | null
          discount_type?: string
          discount_value?: number
          draft_number?: string | null
          due_date?: string | null
          id?: string
          inventory_deducted?: boolean
          invoice_number?: string | null
          invoiced_at?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          quotation_number?: string | null
          quote_number?: string
          quoted_at?: string | null
          share_token?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          vehicle_id?: number | null
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          custom_vehicle_notes?: string | null
          customer_id?: string
          discount_amount?: number
          discount_reason?: string | null
          discount_type?: string
          discount_value?: number
          draft_number?: string | null
          due_date?: string | null
          id?: string
          inventory_deducted?: boolean
          invoice_number?: string | null
          invoiced_at?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          quotation_number?: string | null
          quote_number?: string
          quoted_at?: string | null
          share_token?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          vehicle_id?: number | null
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      superadmin_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json
          id: string
          ip_address: unknown
          target_tenant_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          target_tenant_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          target_tenant_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "superadmin_audit_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          allow_international_phones: boolean
          bank_account_number: string | null
          bank_account_title: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_raast_id: string | null
          bank_wallets: Json
          clock_24_hour: boolean
          clock_style: string
          created_at: string
          currency: string
          draft_prefix: string
          draft_start_number: number
          email: string | null
          id: string
          invoice_prefix: string
          invoice_start_number: number
          invoice_terms: string | null
          logo_url: string | null
          name: string
          ntn: string | null
          phone: string | null
          prices_include_tax: boolean
          print_format: string
          quote_footer_notes: string | null
          quote_prefix: string
          quote_start_number: number
          quote_validity_days: number
          show_clock: boolean
          show_paisa: boolean
          slug: string
          status: string
          strn: string | null
          tax_rate: number
          timezone: string
          updated_at: string
          week_start: number
        }
        Insert: {
          address?: string | null
          allow_international_phones?: boolean
          bank_account_number?: string | null
          bank_account_title?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_raast_id?: string | null
          bank_wallets?: Json
          clock_24_hour?: boolean
          clock_style?: string
          created_at?: string
          currency?: string
          draft_prefix?: string
          draft_start_number?: number
          email?: string | null
          id?: string
          invoice_prefix?: string
          invoice_start_number?: number
          invoice_terms?: string | null
          logo_url?: string | null
          name: string
          ntn: string | null
          phone?: string | null
          prices_include_tax?: boolean
          print_format?: string
          quote_footer_notes?: string | null
          quote_prefix?: string
          quote_start_number?: number
          quote_validity_days?: number
          show_clock?: boolean
          show_paisa?: boolean
          slug: string
          status?: string
          strn: string | null
          tax_rate?: number
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Update: {
          address?: string | null
          allow_international_phones?: boolean
          bank_account_number?: string | null
          bank_account_title?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_raast_id?: string | null
          bank_wallets?: Json
          clock_24_hour?: boolean
          clock_style?: string
          created_at?: string
          currency?: string
          draft_prefix?: string
          draft_start_number?: number
          email?: string | null
          id?: string
          invoice_prefix?: string
          invoice_start_number?: number
          invoice_terms?: string | null
          logo_url?: string | null
          name?: string
          ntn?: string | null
          phone?: string | null
          prices_include_tax?: boolean
          print_format?: string
          quote_footer_notes?: string | null
          quote_prefix?: string
          quote_start_number?: number
          quote_validity_days?: number
          show_clock?: boolean
          show_paisa?: boolean
          slug?: string
          status?: string
          strn?: string | null
          tax_rate?: number
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          created_at: string
          id: number
          make: string
          model: string
          tenant_id: string | null
          trim: string | null
          year: number
        }
        Insert: {
          created_at?: string
          id?: number
          make: string
          model: string
          tenant_id?: string | null
          trim?: string | null
          year: number
        }
        Update: {
          created_at?: string
          id?: number
          make?: string
          model?: string
          tenant_id?: string | null
          trim?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_vehicle: {
        Args: { p_make: string; p_model: string; p_year: number }
        Returns: {
          id: number
          make: string
          model: string
          trim: string
          year: number
        }[]
      }
      convert_quote: {
        Args: { p_quote_id: string; p_target: string }
        Returns: {
          amount_paid: number
          created_at: string
          created_by: string | null
          custom_vehicle_notes: string | null
          customer_id: string
          discount_amount: number
          discount_reason: string | null
          discount_type: string
          discount_value: number
          draft_number: string | null
          due_date: string | null
          id: string
          inventory_deducted: boolean
          invoice_number: string | null
          invoiced_at: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_notes: string | null
          quotation_number: string | null
          quote_number: string
          quoted_at: string | null
          share_token: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          vehicle_id: number | null
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_tenant_id: { Args: never; Returns: string }
      customer_directory_stats: {
        Args: never
        Returns: {
          b2b: number
          outstanding: number
          total: number
        }[]
      }
      document_list_totals: {
        Args: {
          p_search: string
          p_status_key: string
          p_statuses: string[]
          p_today: string
        }
        Returns: {
          owed: number
          total: number
        }[]
      }
      filter_documents: {
        Args: {
          p_search: string
          p_status_key: string
          p_statuses: string[]
          p_today: string
        }
        Returns: Database["public"]["Tables"]["quotes"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dashboard_metrics: {
        Args: { p_from?: string; p_range?: string; p_to?: string }
        Returns: Json
      }
      is_valid_timezone: { Args: { p_tz: string }; Returns: boolean }
      next_document_number: { Args: { p_prefix: string }; Returns: string }
      shop_alerts: { Args: never; Returns: Json }
      record_payment: {
        Args: {
          p_amount: number
          p_items?: Json
          p_method: string
          p_notes?: string
          p_paid_on: string
          p_quote_id: string
        }
        Returns: string
      }
      report_data: {
        Args: { p_from?: string; p_range?: string; p_to?: string }
        Returns: Json
      }
      save_inventory_item: {
        Args: {
          p_category_id: string
          p_cost_price: number
          p_description?: string
          p_is_universal: boolean
          p_item_id?: string
          p_low_stock_threshold: number
          p_name: string
          p_price_includes_tax?: boolean
          p_quantity_on_hand: number
          p_selling_price: number
          p_sku: string
          p_vehicle_ids?: number[]
          p_vendor_name?: string
        }
        Returns: string
      }
      save_quote: {
        Args: {
          p_custom_vehicle_notes?: string
          p_customer_id: string
          p_discount_reason?: string
          p_discount_type?: string
          p_discount_value?: number
          p_due_date?: string
          p_items: Json
          p_notes?: string
          p_quote_id?: string
          p_stage?: string
          p_vehicle_id?: number
          p_walk_in_name?: string
          p_walk_in_phone?: string
        }
        Returns: {
          amount_paid: number
          created_at: string
          created_by: string | null
          custom_vehicle_notes: string | null
          customer_id: string
          discount_amount: number
          discount_reason: string | null
          discount_type: string
          discount_value: number
          draft_number: string | null
          due_date: string | null
          id: string
          inventory_deducted: boolean
          invoice_number: string | null
          invoiced_at: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_notes: string | null
          quotation_number: string | null
          quote_number: string
          quoted_at: string | null
          share_token: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          vehicle_id: number | null
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_customers: {
        Args: { p_query: string }
        Returns: {
          billing_address: string | null
          cnic_or_ntn: string | null
          contact_person: string | null
          credit_days: number
          created_at: string
          customer_type: string
          default_discount_percentage: number
          email: string | null
          id: string
          is_walk_in: boolean
          name: string
          notes: string | null
          phone: string | null
          strn: string | null
          tax_registration_status: string
          tenant_id: string
          updated_at: string
          whatsapp_number: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_inventory_items: {
        Args: { p_query: string }
        Returns: {
          available_quantity: number
          category_id: string
          cost_price: number
          created_at: string
          description: string | null
          id: string
          is_low_stock: boolean
          is_universal: boolean
          low_stock_threshold: number
          name: string
          price_includes_tax: boolean
          quantity_on_hand: number
          reserved_quantity: number
          selling_price: number
          sku: string
          tenant_id: string
          updated_at: string
          vendor_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vehicle_makes: {
        Args: { p_year: number }
        Returns: {
          make: string
        }[]
      }
      vehicle_models: {
        Args: { p_make: string; p_year: number }
        Returns: {
          id: number
          model: string
          trim: string
        }[]
      }
      vehicle_years: {
        Args: never
        Returns: {
          year: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
